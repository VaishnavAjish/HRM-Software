<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\AuthorizationCache;
use Database\Seeders\PermissionRegistrySeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * authz:repair-custom-business-shells — grants the management-shell containers
 * (ui.portals, ui.portals.business) to existing custom BUSINESS roles that
 * pre-date the create-time fix. Disposable database only (phpunit.disposable.xml).
 */
class RepairCustomBusinessShellsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);
    }

    private function businessRole(array $overrides = []): Role
    {
        return Role::create(array_merge([
            'name' => 'Biz ' . Str::random(5),
            'code' => 'biz_' . Str::lower(Str::random(8)),
            'type' => 'Custom',
            'role_type' => 'BUSINESS',
            'is_active' => true,
            'is_system' => false,
            'is_assignable' => true,
            'status' => 'ACTIVE',
        ], $overrides));
    }

    private function permId(string $code): int
    {
        return (int) Permission::where('code', $code)->value('id');
    }

    private function grant(int $roleId, string $code, string $effect = 'ALLOW'): void
    {
        DB::table('role_permissions')->updateOrInsert(
            ['role_id' => $roleId, 'permission_id' => $this->permId($code)],
            ['effect' => $effect, 'obligations' => null, 'inherit_to_children' => true]
        );
    }

    private function holdsAllow(int $roleId, string $code): bool
    {
        $row = DB::table('role_permissions')->where('role_id', $roleId)->where('permission_id', $this->permId($code))->first();

        return $row !== null && strtoupper($row->effect ?? 'ALLOW') !== 'DENY';
    }

    private function repairAudits(int $roleId): int
    {
        return DB::table('authorization_permission_audit_logs')
            ->where('subject_id', (string) $roleId)
            ->where('change_type', 'BUSINESS_SHELL_REPAIR')
            ->count();
    }

    private function repair(array $opts = []): void
    {
        Artisan::call('authz:repair-custom-business-shells', $opts);
    }

    public function test_dry_run_reports_without_changing_grants_audits_or_cache(): void
    {
        $role = $this->businessRole();
        $cache = app(AuthorizationCache::class);

        $rpBefore = DB::table('role_permissions')->count();
        $auditsBefore = DB::table('authorization_permission_audit_logs')->count();
        $cacheBefore = $cache->version(null);

        $this->repair();

        $this->assertFalse($this->holdsAllow($role->id, 'ui.portals'));
        $this->assertFalse($this->holdsAllow($role->id, 'ui.portals.business'));
        $this->assertSame($rpBefore, DB::table('role_permissions')->count());
        $this->assertSame($auditsBefore, DB::table('authorization_permission_audit_logs')->count());
        $this->assertSame($cacheBefore, $cache->version(null));
    }

    public function test_apply_grants_both_shell_permissions_with_audit(): void
    {
        $role = $this->businessRole();

        $this->repair(['--apply' => true]);

        $this->assertTrue($this->holdsAllow($role->id, 'ui.portals'));
        $this->assertTrue($this->holdsAllow($role->id, 'ui.portals.business'));
        $this->assertSame(2, $this->repairAudits($role->id));
    }

    public function test_partial_role_receives_only_the_missing_permission(): void
    {
        $role = $this->businessRole();
        $this->grant($role->id, 'ui.portals');

        $this->repair(['--apply' => true]);

        $this->assertTrue($this->holdsAllow($role->id, 'ui.portals.business'));
        $this->assertSame(1, $this->repairAudits($role->id));
    }

    public function test_explicit_deny_is_preserved_and_role_skipped(): void
    {
        $role = $this->businessRole();
        $this->grant($role->id, 'ui.portals.business', 'DENY');

        $this->repair(['--apply' => true]);

        $denyRow = DB::table('role_permissions')
            ->where('role_id', $role->id)->where('permission_id', $this->permId('ui.portals.business'))->first();
        $this->assertSame('DENY', strtoupper($denyRow->effect));
        $this->assertFalse($this->holdsAllow($role->id, 'ui.portals'));
        $this->assertSame(0, $this->repairAudits($role->id));
    }

    public function test_excludes_system_inactive_and_non_business_roles(): void
    {
        $roles = [
            $this->businessRole(['is_system' => true]),
            $this->businessRole(['is_active' => false]),
            $this->businessRole(['role_type' => 'EMPLOYEE']),
            $this->businessRole(['type' => 'System']),
        ];

        $this->repair(['--apply' => true]);

        foreach ($roles as $role) {
            $this->assertFalse($this->holdsAllow($role->id, 'ui.portals.business'), "role {$role->id} must be excluded");
        }
    }

    public function test_role_option_targets_by_id_and_code(): void
    {
        $a = $this->businessRole();
        $b = $this->businessRole();

        $this->repair(['--apply' => true, '--role' => (string) $a->id]);
        $this->assertTrue($this->holdsAllow($a->id, 'ui.portals.business'));
        $this->assertFalse($this->holdsAllow($b->id, 'ui.portals.business'));

        $this->repair(['--apply' => true, '--role' => $b->code]);
        $this->assertTrue($this->holdsAllow($b->id, 'ui.portals.business'));
    }

    public function test_second_apply_is_a_noop(): void
    {
        $role = $this->businessRole();

        $this->repair(['--apply' => true]);
        $auditsAfterFirst = $this->repairAudits($role->id);

        $this->repair(['--apply' => true]);
        $this->assertSame($auditsAfterFirst, $this->repairAudits($role->id));
    }

    public function test_repaired_role_user_resolves_to_admin_portal_with_pages_denied(): void
    {
        config([
            'authorization.enforcement.default_mode' => 'enforced',
            'authorization.enforcement.enforced_prefixes' => ['self.', 'ui.', 'hr.', 'payroll.'],
        ]);

        $role = $this->businessRole();
        // A pre-shell-fix role that already has the self-service baseline but not the shell.
        $this->grant($role->id, 'self.profile.read');

        $user = User::create([
            'name' => 'SR' . Str::random(4),
            'email' => Str::lower(Str::random(10)) . '@shell.test',
            'password' => 'x',
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
        ]);
        $user->roles()->sync([$role->id]);

        $this->repair(['--apply' => true]);

        $snapshot = $this->withToken(auth('api')->login($user))
            ->getJson('/api/v1/authorization/me')
            ->assertOk()
            ->json('data');

        $this->assertSame('admin', $snapshot['portal']);
        $this->assertTrue($snapshot['permissions']['ui.portals.business']['allowed']);
        $this->assertFalse($snapshot['permissions']['ui.access_control']['allowed']);
        $this->assertFalse($snapshot['permissions']['ui.dashboard']['allowed']);
    }
}
