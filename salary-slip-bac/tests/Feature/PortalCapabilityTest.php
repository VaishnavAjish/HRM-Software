<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\FeatureFlags;
use Database\Seeders\PermissionRegistrySeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The application shell is chosen by the Permission Matrix, not the legacy tier.
 *
 * UserTypeRoles::tierForCode() maps every code it does not recognise to the
 * employee tier, so HR Manager, Account and every custom role report tier 3.
 * The browser then chose the shell from that tier, upgrading a non-admin tier
 * only when the account held whatever permission governs the /admin route —
 * ui.dashboard. Two consequences:
 *
 *   the dashboard became a hidden prerequisite for every other business page,
 *   so a role granted ui.hr but not ui.dashboard landed in the employee shell
 *   and could never reach HR however the matrix was configured;
 *
 *   and the shell a role got was decided by a number that says nothing about
 *   the role.
 *
 * ui.portals.* makes it explicit. A shell is not authority: holding the business
 * shell grants no page and no action, and ui.access_control stays independently
 * denied.
 */
class PortalCapabilityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);

        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );

        foreach ([null, 'nidhi-impex'] as $tenant) {
            app(FeatureFlags::class)->forget('authorization_shadow_mode', $tenant);
        }
    }

    private function roleWith(string $code, string $name, array $permissionCodes): Role
    {
        $role = Role::query()->create([
            'name' => $name, 'code' => $code, 'type' => 'Custom', 'role_type' => 'BUSINESS',
            'is_active' => true, 'is_system' => false, 'is_assignable' => true,
            'is_sensitive' => false, 'requires_approval' => false,
            'default_scope_type' => 'TENANT', 'status' => 'ACTIVE',
        ]);

        foreach ($permissionCodes as $permissionCode) {
            $id = Permission::query()->where('code', $permissionCode)->value('id');
            $this->assertNotNull($id, "{$permissionCode} is not catalogued.");

            DB::table('role_permissions')->insert([
                'role_id' => $role->id, 'permission_id' => $id,
                'effect' => 'ALLOW', 'inherit_to_children' => true,
            ]);
        }

        return $role;
    }

    private function userWith(Role $role, string $empCode, int $tier = 3): User
    {
        $user = User::create([
            'name' => $empCode, 'email' => strtolower($empCode) . '@portal.local',
            'password' => 'secret1234', 'emp_code' => $empCode, 'role' => $tier,
            'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $user->roles()->sync([$role->id]);

        return $user;
    }

    private function snapshotFor(User $user): array
    {
        return $this->withToken(auth('api')->login($user))
            ->getJson('/api/v1/authorization/me')->assertOk()->json('data');
    }

    public function test_the_business_capability_places_a_tier_three_role_in_the_management_shell(): void
    {
        // The case the old rule could not express: HR access, no dashboard.
        $role = $this->roleWith('quality_manager', 'Quality Manager', [
            'ui.portals', 'ui.portals.business',
            'ui.hr',
        ]);

        $snapshot = $this->snapshotFor($this->userWith($role, 'Q-1'));

        $this->assertSame('admin', $snapshot['portal']);
        $this->assertFalse(
            $snapshot['permissions']['ui.dashboard']['allowed'],
            'The shell must not depend on holding the dashboard.',
        );
    }

    public function test_the_shell_is_not_authority(): void
    {
        // Being drawn in the management frame grants nothing.
        $role = $this->roleWith('ops_manager', 'Ops Manager', ['ui.portals', 'ui.portals.business', 'ui.hr']);
        $user = $this->userWith($role, 'Q-2');

        $snapshot = $this->snapshotFor($user);

        $this->assertSame('admin', $snapshot['portal']);
        $this->assertFalse($snapshot['permissions']['ui.access_control']['allowed']);

        // And the backend refuses it too, not merely the navigation.
        $this->withToken(auth('api')->login($user))
            ->getJson('/api/v1/admin/users')->assertStatus(403);
    }

    public function test_the_employee_capability_keeps_a_role_in_self_service(): void
    {
        $role = $this->roleWith('shop_floor', 'Shop Floor', ['ui.portals', 'ui.portals.employee']);

        $this->assertSame('employee', $this->snapshotFor($this->userWith($role, 'Q-3'))['portal']);
    }

    public function test_the_agent_capability_wins_over_the_business_one(): void
    {
        $role = $this->roleWith('field_agent', 'Field Agent', [
            'ui.portals', 'ui.portals.agent',
            'ui.portals.business',
        ]);

        $this->assertSame('agent', $this->snapshotFor($this->userWith($role, 'Q-4'))['portal']);
    }

    public function test_an_unconfigured_role_keeps_the_previous_behaviour(): void
    {
        /*
         * The compatibility guarantee. No existing role holds a portal
         * capability, so this change must move nobody: a tier-3 role with no
         * capability and no dashboard stays in the employee shell, exactly as
         * before.
         */
        $role = $this->roleWith('legacy_business', 'Legacy Business', ['ui.hr']);

        $this->assertSame('employee', $this->snapshotFor($this->userWith($role, 'Q-5'))['portal']);
    }

    public function test_the_previous_dashboard_upgrade_still_works_unconfigured(): void
    {
        // The old escape hatch is preserved rather than removed, so a role that
        // relied on it does not lose its shell.
        $role = $this->roleWith('legacy_dashboard', 'Legacy Dashboard', ['ui.dashboard']);

        $this->assertSame('admin', $this->snapshotFor($this->userWith($role, 'Q-6'))['portal']);
    }

    public function test_a_super_admin_is_never_subject_to_portal_configuration(): void
    {
        $root = User::create([
            'name' => 'Root', 'email' => 'root@portal.local', 'password' => 'secret1234',
            'emp_code' => 'Q-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $root->roles()->sync([Role::query()->where('code', 'super_administrator')->value('id')]);

        $this->assertSame('admin', $this->snapshotFor($root)['portal']);
    }

    public function test_a_portal_capability_grants_no_page_or_action(): void
    {
        // Stated on its own because it is the property that keeps a business
        // shell from becoming administrator authority.
        $role = $this->roleWith('shell_only', 'Shell Only', ['ui.portals', 'ui.portals.business']);

        $snapshot = $this->snapshotFor($this->userWith($role, 'Q-7'));

        foreach (['ui.hr', 'ui.dashboard', 'ui.employees.view', 'ui.access_control'] as $code) {
            $this->assertFalse(
                $snapshot['permissions'][$code]['allowed'],
                "{$code} was granted by the shell capability alone.",
            );
        }
    }
}
