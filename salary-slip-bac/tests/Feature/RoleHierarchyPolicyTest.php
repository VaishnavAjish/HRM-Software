<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Support\RoleHierarchy;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The approved role-assignment policy, asserted against the LIVE role codes.
 *
 * The codes matter more than anything else here. RbacSeeder seeds
 * `tenant_administrator`; the production database has no such role and calls its
 * administrator `admin`. Every existing hierarchy test therefore exercised a
 * configuration that does not exist in production, and the gap it hid was not
 * small: with `admin` unmapped, the Admin role classified as CUSTOM, and CUSTOM
 * is a tier an administrator may manage. An Admin could grant the Admin role and
 * edit the Admin role's own permission matrix — add any permission to the role
 * you already hold.
 *
 * So setUp reshapes the seeded roles into the production shape, and these tests
 * state the policy rather than describing whatever the code happens to do:
 *
 *   Only a super administrator may create or change an administrator.
 *   An administrator may still assign Employee and HR Manager.
 *   Nobody may assign or mutate the super administrator role.
 *   Nobody may change their own tier.
 */
class RoleHierarchyPolicyTest extends TestCase
{
    use RefreshDatabase;

    private Role $adminRole;

    private Role $empRole;

    private Role $hrRole;

    private Role $superRole;

    private User $superAdmin;

    private User $admin;

    private User $hrManager;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);

        // Production shape: the administrator's code is `admin`, the employee's
        // is `emp`, and nothing carries a meaningful role_class.
        Role::query()->where('code', 'tenant_administrator')->update([
            'code' => 'admin', 'is_system' => false, 'is_sensitive' => false, 'role_class' => 'CUSTOM',
        ]);
        Role::query()->where('code', 'employee')->update(['code' => 'emp', 'role_class' => 'CUSTOM']);
        Role::query()->where('code', 'hr_manager')->update(['role_class' => 'CUSTOM']);

        $this->adminRole = Role::query()->where('code', 'admin')->firstOrFail();
        $this->empRole = Role::query()->where('code', 'emp')->firstOrFail();
        $this->hrRole = Role::query()->where('code', 'hr_manager')->firstOrFail();
        $this->superRole = Role::query()->where('code', 'super_administrator')->firstOrFail();

        $this->superAdmin = $this->user('P-SUPER', 0, $this->superRole);
        $this->admin = $this->user('P-ADMIN', 1, $this->adminRole);
        $this->hrManager = $this->user('P-HR', 3, $this->hrRole);
        $this->employee = $this->user('P-EMP', 3, $this->empRole);
    }

    private function user(string $empCode, int $tier, Role $role): User
    {
        $user = User::create([
            'name' => $empCode, 'email' => strtolower($empCode) . '@policy.local',
            'password' => 'secret1234', 'emp_code' => $empCode, 'role' => $tier,
            'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $user->roles()->sync([$role->id]);

        return $user;
    }

    /* ------------------------------------------------------- classification */

    public function test_the_live_administrator_code_classifies_as_the_admin_tier(): void
    {
        // The root cause, asserted directly. `admin` was unmapped and fell
        // through to CUSTOM at rank 30 — below the tier it represents.
        $this->assertSame(RoleHierarchy::ADMIN, RoleHierarchy::classOf($this->adminRole));
        $this->assertSame(80, RoleHierarchy::rankOf($this->adminRole));
    }

    public function test_the_live_employee_code_classifies_as_the_employee_tier(): void
    {
        $this->assertSame(RoleHierarchy::EMPLOYEE, RoleHierarchy::classOf($this->empRole));
    }

    public function test_an_unmapped_business_role_remains_custom(): void
    {
        // HR Manager is genuinely custom: a capability, not a tier. It must not
        // be swept into a tier by the same change.
        $this->assertSame(RoleHierarchy::CUSTOM, RoleHierarchy::classOf($this->hrRole));
    }

    public function test_holding_the_admin_role_makes_an_actor_an_administrator_without_the_legacy_tier(): void
    {
        // Identity is the role. Before the fix this actor classified as
        // EMPLOYEE, and their peers could rewrite their roles.
        $rbacOnly = $this->user('P-RBAC', 3, $this->adminRole);

        $this->assertSame(RoleHierarchy::ADMIN, RoleHierarchy::actorClass($rbacOnly));
        $this->assertSame(RoleHierarchy::ADMIN, RoleHierarchy::userClass($rbacOnly));
    }

    /* ------------------------------------------------------ approved policy */

    public function test_a_super_admin_may_assign_the_admin_role(): void
    {
        $this->assertTrue(RoleHierarchy::canAssignRole($this->superAdmin, $this->adminRole));
    }

    public function test_an_admin_may_not_assign_the_admin_role(): void
    {
        // Approved policy: only a super administrator creates administrators.
        $this->assertFalse(RoleHierarchy::canAssignRole($this->admin, $this->adminRole));
    }

    public function test_an_admin_may_still_assign_employee_and_hr_manager(): void
    {
        // Demotion to Employee and granting HR Manager are ordinary
        // administration and must keep working.
        $this->assertTrue(RoleHierarchy::canAssignRole($this->admin, $this->empRole));
        $this->assertTrue(RoleHierarchy::canAssignRole($this->admin, $this->hrRole));
    }

    public function test_an_hr_manager_may_not_assign_the_admin_role(): void
    {
        $this->assertFalse(RoleHierarchy::canAssignRole($this->hrManager, $this->adminRole));
    }

    public function test_nobody_may_assign_the_super_admin_role(): void
    {
        // Including the super administrator: the protected identity is not
        // grantable through this surface at all.
        foreach ([$this->superAdmin, $this->admin, $this->hrManager, $this->employee] as $actor) {
            $this->assertFalse(RoleHierarchy::canAssignRole($actor, $this->superRole));
        }
    }

    public function test_an_admin_may_not_edit_the_admin_roles_own_permission_matrix(): void
    {
        /*
         * The sharpest consequence of the misclassification. canManage() gates
         * PermissionMatrixController, so an Admin who could manage the Admin
         * role could add any permission at all to the role they themselves
         * hold — self-escalation with no ceiling.
         */
        $this->assertFalse(RoleHierarchy::canManage($this->admin, $this->adminRole));
        $this->assertTrue(RoleHierarchy::canManage($this->superAdmin, $this->adminRole));
    }

    public function test_an_admin_may_not_rewrite_the_roles_of_another_admin(): void
    {
        $peer = $this->user('P-PEER', 1, $this->adminRole);
        $rbacOnlyPeer = $this->user('P-PEER2', 3, $this->adminRole);

        $this->assertFalse(RoleHierarchy::canManageUserRoles($this->admin, $peer));
        // The tier-3 case was the hole: this returned true before the fix.
        $this->assertFalse(RoleHierarchy::canManageUserRoles($this->admin, $rbacOnlyPeer));
    }

    public function test_an_admin_may_rewrite_the_roles_of_employees_and_hr_managers(): void
    {
        $this->assertTrue(RoleHierarchy::canManageUserRoles($this->admin, $this->employee));
        $this->assertTrue(RoleHierarchy::canManageUserRoles($this->admin, $this->hrManager));
    }

    public function test_nobody_changes_their_own_tier(): void
    {
        foreach ([$this->superAdmin, $this->admin, $this->hrManager] as $actor) {
            $this->assertFalse(RoleHierarchy::canManageUserRoles($actor, $actor));
        }
    }

    public function test_an_employee_may_manage_nothing(): void
    {
        $this->assertSame([], RoleHierarchy::MANAGEABLE[RoleHierarchy::actorClass($this->employee)]);
    }

    /* -------------------------------------------------------- reserved code */

    public function test_both_administrator_and_employee_spellings_are_reserved(): void
    {
        // A role may not be created that claims a canonical tier by its code —
        // uniqueness alone would only block a duplicate, so a spelling absent
        // from a given deployment would otherwise be mintable.
        foreach (['admin', 'tenant_administrator', 'emp', 'employee', 'Admin', ' ADMIN '] as $code) {
            $this->assertTrue(RoleHierarchy::isReservedCode($code), "{$code} must be reserved");
        }

        $this->assertFalse(RoleHierarchy::isReservedCode('floor_supervisor'));
    }

    public function test_the_admin_tier_codes_are_discoverable_rather_than_copied(): void
    {
        // RoleManagementService hid the Admin tier by naming one code inline and
        // therefore hid nothing on this database. It asks the hierarchy now.
        $codes = RoleHierarchy::codesForClass(RoleHierarchy::ADMIN);

        $this->assertContains('admin', $codes);
        $this->assertContains('tenant_administrator', $codes);
        $this->assertNotContains('super_administrator', $codes);
    }

    /* ------------------------------------------------ end-to-end enforcement */

    public function test_the_api_refuses_an_admin_promoting_someone_to_admin(): void
    {
        $this->seed(\Database\Seeders\AdminUserManagementPermissionSeeder::class);

        $this->withToken(auth('api')->login($this->admin))
            ->postJson('/api/v1/admin/users/' . $this->employee->id . '/assign-role', [
                'roleIds' => [$this->adminRole->id], 'reason' => 'Attempted promotion.',
            ])->assertStatus(403);

        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $this->employee->id, 'role_id' => $this->adminRole->id,
        ]);
    }

    public function test_the_api_refuses_an_admin_promoting_someone_to_admin_through_the_edit_form(): void
    {
        // The same boundary by the other route. Edit writes roles now, so it
        // has to be guarded identically to explicit assignment.
        $this->seed(\Database\Seeders\AdminUserManagementPermissionSeeder::class);

        $this->withToken(auth('api')->login($this->admin))
            ->putJson('/api/v1/admin/users/' . $this->employee->id, [
                'roleId' => $this->adminRole->id,
            ])->assertStatus(403);

        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $this->employee->id, 'role_id' => $this->adminRole->id,
        ]);
    }

    public function test_a_super_admin_can_still_promote_an_employee_to_admin(): void
    {
        $this->seed(\Database\Seeders\AdminUserManagementPermissionSeeder::class);

        $this->withToken(auth('api')->login($this->superAdmin))
            ->putJson('/api/v1/admin/users/' . $this->employee->id, [
                'roleId' => $this->adminRole->id,
            ])->assertOk();

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $this->employee->id, 'role_id' => $this->adminRole->id,
        ]);
    }
}
