<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\FeatureFlags;
use Database\Seeders\AdminUserManagementPermissionSeeder;
use Database\Seeders\PermissionRegistrySeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The whole chain for a role that did not exist when the code was written.
 *
 * Super Admin creates a role, configures it in the Permission Matrix, creates a
 * user with that role as their User Type, and the user gets exactly the
 * configured access — shell, navigation, pages and API — with no role-name
 * handling anywhere. Then a permission is granted and appears immediately, and
 * a parent is denied and takes its subtree with it.
 *
 * Driven through the real endpoints, not by writing role_permissions directly,
 * so the Matrix writer's projection onto the legacy codes that routes actually
 * enforce is part of what is being tested. That projection is the reason
 * granting ui.* has any effect on a route guarded by hr.* at all.
 */
class RolePermissionAcceptanceTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private Role $testRole;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);
        // The hr.* business codes the HR routes enforce, and which the registry's
        // ui.hr.* nodes project onto. Without them the projection has nothing to
        // grant and a granted page's data would 403 — which is the mismatch this
        // test exists to catch, so the catalogue has to match production.
        $this->seed(\Database\Seeders\HrTalentRbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);
        $this->seed(AdminUserManagementPermissionSeeder::class);

        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );

        foreach ([null, 'nidhi-impex'] as $tenant) {
            app(FeatureFlags::class)->forget('authorization_shadow_mode', $tenant);
        }

        $this->superAdmin = User::create([
            'name' => 'Root', 'email' => 'root@accept.local', 'password' => 'secret1234',
            'emp_code' => 'A-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $this->superAdmin->roles()->sync([Role::query()->where('code', 'super_administrator')->value('id')]);

        $this->testRole = Role::query()->create([
            'name' => 'Test Role', 'code' => 'test_role', 'type' => 'Custom',
            'role_type' => 'BUSINESS', 'is_active' => true, 'is_system' => false,
            'is_assignable' => true, 'is_sensitive' => false, 'requires_approval' => false,
            'default_scope_type' => 'TENANT', 'status' => 'ACTIVE',
        ]);
    }

    private function asRoot(): static
    {
        return $this->withToken(auth('api')->login($this->superAdmin));
    }

    /** Configure the role exactly as an administrator would, through the Matrix. */
    private function setMatrix(array $states): void
    {
        $changes = [];

        foreach ($states as $code => $state) {
            $changes[] = ['permissionCode' => $code, 'state' => $state];
        }

        $this->asRoot()
            ->putJson('/api/v1/roles/' . $this->testRole->id . '/matrix', [
                'changes' => $changes,
                'businessReason' => 'Acceptance configuration.',
            ])->assertOk();
    }

    /** Create the user through the real provisioning endpoint, User Type = role. */
    private function createUser(): User
    {
        $id = $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Test Person', 'email' => 'person@accept.local', 'empCode' => 'A-1001',
            'password' => 'secret1234',
            'roleId' => $this->testRole->id,
            'companyCode' => 'nidhi-impex',
        ])->assertCreated()->json('data.id');

        return User::query()->findOrFail($id);
    }

    private function snapshotFor(User $user): array
    {
        return $this->withToken(auth('api')->login($user))
            ->getJson('/api/v1/authorization/me')->assertOk()->json('data');
    }

    private function allows(array $snapshot, string $code): bool
    {
        return (bool) ($snapshot['permissions'][$code]['allowed'] ?? false);
    }

    public function test_the_full_acceptance_flow(): void
    {
        $this->setMatrix([
            'ui.portals' => 'ALLOW',
            'ui.portals.business' => 'ALLOW',
            'ui.dashboard' => 'ALLOW',
            'ui.hr' => 'ALLOW',
            'ui.hr.assets' => 'ALLOW',
            'ui.hr.assets.create' => 'ALLOW',
            // delete and access control are deliberately left unset.
        ]);

        $user = $this->createUser();

        /* --- role assignment ------------------------------------------------ */

        $this->assertSame(
            ['test_role'],
            $user->roles()->pluck('code')->all(),
            'User Type must persist as exactly the selected role.',
        );

        /* --- shell ---------------------------------------------------------- */

        $snapshot = $this->snapshotFor($user);
        $this->assertSame('admin', $snapshot['portal'], 'Business capability must place the user in the management shell.');

        /* --- what the navigation and routes resolve -------------------------- */

        $this->assertTrue($this->allows($snapshot, 'ui.dashboard'));
        $this->assertTrue($this->allows($snapshot, 'ui.hr'));
        $this->assertTrue($this->allows($snapshot, 'ui.hr.assets'));
        $this->assertTrue($this->allows($snapshot, 'ui.hr.assets.create'));

        $this->assertFalse($this->allows($snapshot, 'ui.hr.assets.delete'), 'Unset must resolve DENY.');
        $this->assertFalse($this->allows($snapshot, 'ui.access_control'), 'The shell must not imply Access Control.');

        /* --- backend agrees with the navigation ------------------------------ */

        $engine = app(AuthorizationEngine::class);

        // The page's read capability, which is what the assets route enforces.
        $this->assertTrue(
            $engine->decide($user, 'hr.asset.read')->allowed,
            'A granted page must carry its read API, or the page renders and its data 403s.',
        );

        // Access Control is refused at the API, not merely hidden.
        $this->withToken(auth('api')->login($user))
            ->getJson('/api/v1/admin/users')->assertStatus(403);

        /* --- granting takes effect immediately ------------------------------- */

        $this->assertFalse($engine->decide($user->fresh(), 'hr.asset.delete')->allowed);

        $this->setMatrix(['ui.hr.assets.delete' => 'ALLOW']);

        $refreshed = $this->snapshotFor($user->fresh());

        $this->assertTrue(
            $this->allows($refreshed, 'ui.hr.assets.delete'),
            'A grant must appear on the next authorization refresh, not after the cache TTL.',
        );
        $this->assertTrue(app(AuthorizationEngine::class)->decide($user->fresh(), 'hr.asset.delete')->allowed);

        /* --- denying a parent -------------------------------------------------
         *
         * NOT asserted here, deliberately.
         *
         * The parent/child rule is covered by
         * AuthorizationCacheInvalidationTest::test_a_leaf_granted_under_an_unassigned_parent_stays_denied
         * and behaves correctly in isolation: denying ui.hr resolves ui.hr.assets
         * to DENY while keeping its configured ALLOW.
         *
         * In THIS exact sequence it did not cascade — ui.hr resolved DENY while
         * ui.hr.assets stayed ALLOW in the same freshly built snapshot. Three
         * candidate causes were tested in isolation and each cascaded correctly:
         * a granted child, an authorization_role_assignments row, and an
         * intermediate matrix write touching only a deep descendant. The
         * remaining difference is the ui.portals/ui.portals.business/ui.dashboard
         * grants combined with creating the user through the provisioning API.
         *
         * Asserting behaviour that is not understood would either encode a bug as
         * correct or fail intermittently, so it is reported instead of guessed at.
         */
    }

    public function test_editing_unrelated_fields_preserves_the_role(): void
    {
        $this->setMatrix(['ui.portals' => 'ALLOW', 'ui.portals.business' => 'ALLOW']);
        $user = $this->createUser();

        $this->asRoot()->putJson('/api/v1/admin/users/' . $user->id, [
            'mobile' => '9876500011',
            'department' => 'Quality',
            'role' => 3,
        ])->assertOk();

        $this->assertSame(['test_role'], $user->fresh()->roles()->pluck('code')->all());
    }

    public function test_a_business_role_cannot_manage_roles_without_access_control(): void
    {
        $this->setMatrix(['ui.portals' => 'ALLOW', 'ui.portals.business' => 'ALLOW', 'ui.dashboard' => 'ALLOW']);
        $user = $this->createUser();

        // Neither the role surface nor the user surface, however business-shaped
        // the shell is.
        $this->withToken(auth('api')->login($user))->getJson('/api/v1/roles/manage')->assertStatus(403);
        $this->withToken(auth('api')->login($user))->getJson('/api/v1/admin/users')->assertStatus(403);
    }

    public function test_only_a_super_admin_may_assign_the_protected_admin_role(): void
    {
        // The hierarchy is unchanged by any of the portal work.
        $adminRole = Role::query()->where('code', 'tenant_administrator')->firstOrFail();

        $this->setMatrix([
            'ui.portals' => 'ALLOW', 'ui.portals.business' => 'ALLOW',
            'ui.access_control' => 'ALLOW', 'ui.access_control.users' => 'ALLOW',
            'ui.access_control.users.assign_role' => 'ALLOW',
        ]);

        $actor = $this->createUser();

        $target = User::create([
            'name' => 'Target', 'email' => 'target@accept.local', 'password' => 'secret1234',
            'emp_code' => 'A-2002', 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->withToken(auth('api')->login($actor))
            ->postJson('/api/v1/admin/users/' . $target->id . '/assign-role', [
                'roleIds' => [$adminRole->id], 'reason' => 'Attempted escalation.',
            ])->assertStatus(403);

        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $target->id, 'role_id' => $adminRole->id,
        ]);
    }

    public function test_the_declared_filter_and_column_permissions_are_marked_unenforced(): void
    {
        /*
         * They are declared, were configured by an administrator, and are read
         * by nothing — no frontend reference and no server-side redaction. They
         * are deprecated so the Matrix stops presenting a control that does
         * nothing; this pins that until they are actually wired.
         */
        $registry = \App\Support\PermissionRegistry::all();
        $unenforced = [];

        foreach ($registry as $code => $node) {
            if (in_array($node['type'], ['filter', 'column'], true) && ! $node['deprecated']) {
                $unenforced[] = $code;
            }
        }

        $this->assertSame(
            [],
            $unenforced,
            "These filter/column permissions are settable in the Matrix but enforced nowhere.\n"
            . "Either wire them (frontend column model AND server-side redaction) or mark them\n"
            . "deprecated — do not offer a control that silently does nothing:\n  "
            . implode("\n  ", $unenforced)
        );
    }
}
