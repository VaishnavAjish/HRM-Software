<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\RoleManagementService;
use Database\Seeders\PermissionRegistrySeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * A newly created custom role must arrive usable: the self-service baseline is
 * applied at creation so a user assigned only this role can still load their
 * own portal/profile. Without it, no amount of page permissions granted in the
 * Permission Matrix makes the portal reachable under enforced mode.
 *
 * Disposable database only (phpunit.disposable.xml).
 */
class CustomRoleBaselineTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);
    }

    public function test_new_business_role_gets_self_service_and_management_shell_baseline_only(): void
    {
        $role = app(RoleManagementService::class)->create(['name' => 'Recruitment Operator ' . Str::random(4)]);

        $codes = DB::table('role_permissions')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('role_permissions.role_id', $role->id)
            ->pluck('permissions.code')
            ->all();

        foreach ([
            'self.profile.read', 'self.profile.update', 'self.payslip.read',
            'self.ticket.read', 'self.ticket.create',
            'ui.portals', 'ui.portals.business',
        ] as $baseline) {
            $this->assertContains($baseline, $codes, "custom role should receive baseline {$baseline}");
        }

        // Never seed privileged permissions into a fresh custom role.
        foreach (['admin.role.create', 'admin.authorization.configure', 'hr.employee.aadhaar.reveal', 'payroll.payslip.create'] as $privileged) {
            $this->assertNotContains($privileged, $codes, "baseline must not include {$privileged}");
        }

        $this->assertNotContains('ui.portals.agent', $codes);
        $this->assertNotContains('ui.portals.employee', $codes);
    }

    public function test_user_with_only_new_custom_role_can_load_profile_under_enforced_mode(): void
    {
        config([
            'authorization.enforcement.default_mode' => 'enforced',
            'authorization.enforcement.enforced_prefixes' => ['self.', 'ui.', 'hr.', 'payroll.'],
        ]);

        $role = app(RoleManagementService::class)->create(['name' => 'Test Role ' . Str::random(4)]);

        $user = User::create([
            'name' => 'CR' . Str::random(4),
            'email' => Str::lower(Str::random(10)) . '@custom.test',
            'password' => 'x',
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
        ]);
        $user->roles()->syncWithoutDetaching([$role->id]);

        $this->withToken(auth('api')->login($user))
            ->getJson('/api/profile')
            ->assertOk();
    }

    public function test_new_business_role_selects_management_shell_without_granting_business_pages(): void
    {
        config([
            'authorization.enforcement.default_mode' => 'enforced',
            'authorization.enforcement.enforced_prefixes' => ['self.', 'ui.', 'hr.', 'payroll.'],
        ]);

        $role = app(RoleManagementService::class)->create(['name' => 'Business Role ' . Str::random(4)]);

        $user = User::create([
            'name' => 'BR' . Str::random(4),
            'email' => Str::lower(Str::random(10)) . '@custom.test',
            'password' => 'x',
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
        ]);
        $user->roles()->sync([$role->id]);

        $snapshot = $this->withToken(auth('api')->login($user))
            ->getJson('/api/v1/authorization/me')
            ->assertOk()
            ->json('data');

        $this->assertSame('admin', $snapshot['portal']);
        $this->assertTrue($snapshot['permissions']['ui.portals.business']['allowed']);
        $this->assertFalse($snapshot['permissions']['ui.dashboard']['allowed']);
        $this->assertFalse($snapshot['permissions']['ui.salary']['allowed']);
        $this->assertFalse($snapshot['permissions']['ui.access_control']['allowed']);
    }

    public function test_authorization_snapshot_does_not_require_profile_permission(): void
    {
        config([
            'authorization.enforcement.default_mode' => 'enforced',
            'authorization.enforcement.enforced_prefixes' => ['self.', 'ui.', 'hr.', 'payroll.'],
        ]);

        $role = Role::create([
            'name' => 'No Profile ' . Str::random(4),
            'code' => 'no_profile_' . Str::lower(Str::random(4)),
            'type' => 'Custom',
            'role_type' => 'BUSINESS',
            'is_active' => true,
            'is_system' => false,
            'is_assignable' => true,
            'status' => 'ACTIVE',
        ]);

        $user = User::create([
            'name' => 'NP' . Str::random(4),
            'email' => Str::lower(Str::random(10)) . '@custom.test',
            'password' => 'x',
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
        ]);
        $user->roles()->sync([$role->id]);
        $token = auth('api')->login($user);

        $this->withToken($token)
            ->getJson('/api/v1/authorization/me')
            ->assertOk();

        $this->withToken($token)
            ->postJson('/api/v1/authorization/check', ['permissionCode' => 'ui.dashboard'])
            ->assertOk();

        $this->withToken($token)
            ->getJson('/api/profile')
            ->assertForbidden();
    }
}
