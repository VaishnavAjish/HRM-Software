<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\FeatureFlags;
use App\Support\PermissionRegistry;
use Database\Seeders\AdminUserManagementPermissionSeeder;
use Database\Seeders\PermissionRegistrySeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * One authorization pipeline for every shell.
 *
 * Role → effective permissions → portal → route → API, with the Permission
 * Matrix as the only input. These cases exist because two halves of that chain
 * used to be decided somewhere else.
 *
 * The employee and agent menus were filtered against eight codes —
 * employee_dashboard, employee_payslips, agent_trial_form and the rest — that
 * were never in the permissions catalogue. The lookup returned undefined,
 * `undefined !== "no_access"` is true, so every entry rendered and no page could
 * be denied. Neither shell declared a route either, so canRoute() had nothing to
 * resolve and a denied page still opened on a typed URL.
 *
 * And ten route groups carried a `role:` tier guard on top of their permission
 * middleware. RoleMiddleware::resolveRole() reads users.role, which
 * tierForCode() sets to the employee tier for every code it does not recognise —
 * so an HR Manager the matrix had granted hr.dashboard.read was still refused
 * /api/admin-dashboard, and the shell rendered a page whose API said 403.
 */
class ShellAuthorizationMatrixTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);
        $this->seed(AdminUserManagementPermissionSeeder::class);

        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );

        foreach ([null, 'nidhi-impex'] as $tenant) {
            app(FeatureFlags::class)->forget('authorization_shadow_mode', $tenant);
        }
    }

    /** @param list<string> $permissionCodes */
    private function roleWith(string $code, array $permissionCodes): Role
    {
        $role = Role::query()->create([
            'name' => ucwords(str_replace('_', ' ', $code)), 'code' => $code,
            'type' => 'Custom', 'role_type' => 'BUSINESS', 'is_active' => true,
            'is_system' => false, 'is_assignable' => true, 'is_sensitive' => false,
            'requires_approval' => false, 'default_scope_type' => 'TENANT', 'status' => 'ACTIVE',
        ]);

        /*
         * Implied codes are materialised here because RoleMatrixWriter
         * materialises them on a real save: granting ui.dashboard writes a
         * role_permissions row for hr.dashboard.read as well, which is what the
         * `permission:` middleware actually resolves. Inserting only the
         * canonical node would build a role no administrator could produce, and
         * the API assertions below would be testing a fixture rather than the
         * matrix.
         */
        $codes = [];

        foreach ($permissionCodes as $permissionCode) {
            $codes[] = $permissionCode;

            foreach (PermissionRegistry::impliedCodes($permissionCode) as $implied) {
                $codes[] = $implied;
            }
        }

        foreach (array_unique($codes) as $permissionCode) {
            $id = Permission::query()->where('code', $permissionCode)->value('id');

            if ($id === null) {
                // A canonical node with no catalogue row is a real fault — the
                // matrix would show it and then fail the save.
                $this->assertNotContains($permissionCode, $permissionCodes, "{$permissionCode} is not catalogued.");

                /*
                 * Implied legacy codes are a different case. The seeders used
                 * here catalogue a subset, while a real deployment carries all
                 * of them, so an absent one is a gap in this fixture rather than
                 * in the registry. Creating it keeps the API assertions honest:
                 * an uncatalogued code is not enforced at all, which would make
                 * a 200 prove nothing.
                 */
                $id = (int) DB::table('permissions')->insertGetId([
                    'name' => $permissionCode, 'code' => $permissionCode,
                    'description' => $permissionCode, 'is_active' => true,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            DB::table('role_permissions')->insertOrIgnore([
                'role_id' => $role->id, 'permission_id' => $id,
                'effect' => 'ALLOW', 'inherit_to_children' => true,
            ]);
        }

        return $role;
    }

    /** Tier 3 deliberately: the point is that the tier no longer decides anything. */
    private function userWith(Role $role, string $empCode, int $tier = 3): User
    {
        $user = User::create([
            'name' => $empCode, 'email' => strtolower($empCode) . '@shell.local',
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

    /**
     * Application files naming this string.
     *
     * Done in PHP rather than by shelling out to grep: this suite also runs on
     * Windows, where that call fails and its output casts to zero — so the
     * assertion would have passed without searching anything.
     *
     * @return list<string>
     */
    private function applicationFilesMentioning(string $needle): array
    {
        $hits = [];

        $files = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator(app_path(), \FilesystemIterator::SKIP_DOTS)
        );

        foreach ($files as $file) {
            if ($file->getExtension() !== 'php') {
                continue;
            }

            if (str_contains((string) file_get_contents($file->getPathname()), $needle)) {
                $hits[] = $file->getFilename();
            }
        }

        return $hits;
    }

    /** Whether the page governing this route is effectively allowed. */
    private function allowsRoute(array $snapshot, string $path): bool
    {
        $code = $snapshot['routes'][$path] ?? null;

        $this->assertNotNull($code, "{$path} is not governed by any permission.");

        return (bool) ($snapshot['permissions'][$code]['allowed'] ?? false);
    }

    // ── every employee/agent page is now governed ────────────────────────────

    public function test_every_employee_and_agent_route_is_governed_by_a_permission(): void
    {
        $routes = PermissionRegistry::routes();

        foreach ([
            '/employee', '/employee/payslips', '/employee/form16', '/employee/tickets',
            '/employee/profile', '/employee/appointment',
            '/agent', '/agent/trial-forms', '/agent/appointments',
        ] as $path) {
            $this->assertArrayHasKey($path, $routes, "{$path} has no governing permission.");
            $this->assertNotNull(
                Permission::query()->where('code', $routes[$path])->value('id'),
                "{$routes[$path]} governs {$path} but is not catalogued, so the matrix cannot grant it.",
            );
        }
    }

    // ── employee shell ───────────────────────────────────────────────────────

    public function test_the_employee_shell_shows_only_the_pages_the_matrix_granted(): void
    {
        $role = $this->roleWith('shop_employee', [
            'ui.portals', 'ui.portals.employee',
            'ui.portals.employee_dashboard', 'ui.portals.employee_payslips',
            'ui.portals.employee_profile',
        ]);

        $snapshot = $this->snapshotFor($this->userWith($role, 'S-EMP'));

        $this->assertSame('employee', $snapshot['portal']);

        $this->assertTrue($this->allowsRoute($snapshot, '/employee'));
        $this->assertTrue($this->allowsRoute($snapshot, '/employee/payslips'));
        $this->assertTrue($this->allowsRoute($snapshot, '/employee/profile'));

        // The three the matrix did not grant. Before this these rendered anyway.
        $this->assertFalse($this->allowsRoute($snapshot, '/employee/form16'));
        $this->assertFalse($this->allowsRoute($snapshot, '/employee/tickets'));
        $this->assertFalse($this->allowsRoute($snapshot, '/employee/appointment'));
    }

    public function test_a_denied_employee_page_is_refused_by_its_api_too(): void
    {
        $granted = $this->roleWith('ticketing_employee', [
            'ui.portals', 'ui.portals.employee', 'ui.portals.employee_tickets',
        ]);
        $denied = $this->roleWith('quiet_employee', ['ui.portals', 'ui.portals.employee']);

        $allowedUser = $this->userWith($granted, 'S-TIK');
        $deniedUser = $this->userWith($denied, 'S-QUIET');

        // Hiding the entry is not the boundary; the endpoint answers the same.
        $this->assertTrue($this->allowsRoute($this->snapshotFor($allowedUser), '/employee/tickets'));
        $this->assertFalse($this->allowsRoute($this->snapshotFor($deniedUser), '/employee/tickets'));

        $this->withToken(auth('api')->login($deniedUser))
            ->getJson('/api/tickets/get')->assertStatus(403);
    }

    public function test_the_employee_dashboard_api_no_longer_depends_on_the_numeric_tier(): void
    {
        /*
         * /api/dashboard carried `role:employee` alongside its permission. An
         * account the matrix places in the employee shell while holding a
         * different tier was refused by the tier guard even though the
         * permission was granted.
         */
        $role = $this->roleWith('tier_one_selfservice', [
            'ui.portals', 'ui.portals.employee', 'ui.portals.employee_dashboard',
        ]);

        $user = $this->userWith($role, 'S-TIER', tier: 1);

        $this->assertSame('employee', $this->snapshotFor($user)['portal']);
        $this->withToken(auth('api')->login($user))
            ->getJson('/api/dashboard')->assertStatus(200);
    }

    // ── agent shell ──────────────────────────────────────────────────────────

    public function test_the_agent_shell_is_permission_driven(): void
    {
        $role = $this->roleWith('field_rep', [
            'ui.portals', 'ui.portals.agent',
            'ui.portals.agent_dashboard', 'ui.portals.agent_trial_forms',
        ]);

        $snapshot = $this->snapshotFor($this->userWith($role, 'S-AGT', tier: 4));

        $this->assertSame('agent', $snapshot['portal']);
        $this->assertTrue($this->allowsRoute($snapshot, '/agent'));
        $this->assertTrue($this->allowsRoute($snapshot, '/agent/trial-forms'));
        $this->assertFalse($this->allowsRoute($snapshot, '/agent/appointments'));
    }

    // ── business roles ───────────────────────────────────────────────────────

    public function test_hr_manager_reaches_the_management_shell_without_role_management(): void
    {
        $role = $this->roleWith('hr_lead', [
            'ui.portals', 'ui.portals.business',
            'ui.hr', 'ui.dashboard',
        ]);

        $user = $this->userWith($role, 'S-HR');
        $snapshot = $this->snapshotFor($user);

        $this->assertSame('admin', $snapshot['portal']);
        $this->assertTrue($snapshot['permissions']['ui.hr']['allowed']);

        // Requirement 9: the shell confers no role-management authority.
        $this->assertFalse($snapshot['permissions']['ui.access_control.roles']['allowed']);
        $this->withToken(auth('api')->login($user))
            ->getJson('/api/v1/roles/manage')->assertStatus(403);
    }

    public function test_account_reaches_the_management_shell_with_only_its_own_pages(): void
    {
        $role = $this->roleWith('accounts_lead', [
            'ui.portals', 'ui.portals.business',
            'ui.salary', 'ui.reports',
        ]);

        $snapshot = $this->snapshotFor($this->userWith($role, 'S-ACC'));

        $this->assertSame('admin', $snapshot['portal']);
        $this->assertTrue($snapshot['permissions']['ui.salary']['allowed']);
        $this->assertTrue($snapshot['permissions']['ui.reports']['allowed']);
        $this->assertFalse($snapshot['permissions']['ui.hr']['allowed']);
        $this->assertFalse($snapshot['permissions']['ui.access_control']['allowed']);
    }

    public function test_a_business_role_can_call_the_api_behind_a_page_the_matrix_granted(): void
    {
        /*
         * The other half of the tier-guard removal. /api/admin-dashboard sat
         * inside a `role:admin` group, so a tier-3 business role holding
         * hr.dashboard.read was refused a page its own shell had just rendered.
         */
        $role = $this->roleWith('dashboard_reader', [
            'ui.portals', 'ui.portals.business', 'ui.dashboard',
        ]);

        $user = $this->userWith($role, 'S-DASH');

        $this->assertTrue($this->snapshotFor($user)['permissions']['ui.dashboard']['allowed']);
        $this->withToken(auth('api')->login($user))
            ->getJson('/api/admin-dashboard')->assertStatus(200);
    }

    // ── a role nothing in the codebase has heard of ──────────────────────────

    public function test_a_brand_new_custom_role_needs_no_role_specific_code(): void
    {
        $code = 'zzz_unheard_of_role';

        $this->assertSame(
            [],
            $this->applicationFilesMentioning($code),
            'The role name appears in application code, which defeats the point.',
        );

        $role = $this->roleWith($code, [
            'ui.portals', 'ui.portals.business',
            'ui.hr', 'ui.hr.assets',
        ]);

        $snapshot = $this->snapshotFor($this->userWith($role, 'S-NEW'));

        $this->assertSame('admin', $snapshot['portal']);
        $this->assertTrue($snapshot['permissions']['ui.hr']['allowed']);
        $this->assertTrue($snapshot['permissions']['ui.hr.assets']['allowed']);
        $this->assertFalse($snapshot['permissions']['ui.hr.hiring']['allowed']);
    }

    // ── the parent chain still governs the capabilities themselves ───────────

    public function test_a_portal_capability_without_its_parent_does_not_take_effect(): void
    {
        /*
         * ui.portals.business is a child of ui.portals, and requirement 2 keeps
         * the parent/child rule. Granting the child alone is configured ALLOW
         * and effective DENY, so the shell does not change — the same rule the
         * matrix shows in its Effective column.
         */
        $role = $this->roleWith('orphan_capability', ['ui.portals.business', 'ui.hr']);

        $snapshot = $this->snapshotFor($this->userWith($role, 'S-ORPH'));

        $this->assertFalse($snapshot['permissions']['ui.portals.business']['allowed']);
        $this->assertSame('employee', $snapshot['portal']);
    }
}
