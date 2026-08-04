<?php

namespace Tests\Feature;

use App\Exceptions\ProtectedAccountException;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\FeatureFlags;
use Database\Seeders\AdminUserManagementPermissionSeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class HiddenSuperAdminTest extends TestCase
{
    use RefreshDatabase;

    private User $hidden;

    private User $tenantAdmin;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);
        $this->seed(AdminUserManagementPermissionSeeder::class);
        $this->disableShadowMode();

        $this->hidden = User::create([
            'name' => 'Root Owner', 'email' => 'root@system.local', 'password' => 'secret1234',
            'emp_code' => 'SYS-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
            'mobile_number' => '9111111111',
        ]);
        DB::table('users')->where('id', $this->hidden->id)->update([
            'is_hidden' => true, 'is_super_admin' => true, 'is_system_account' => true, 'is_protected' => true,
        ]);
        $this->hidden->refresh();

        $this->tenantAdmin = User::create([
            'name' => 'Tenant Admin', 'email' => 'tenant@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-TEN', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->employee = User::create([
            'name' => 'Asha Patel', 'email' => 'asha@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-1001', 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->grantRole($this->tenantAdmin, 'tenant_administrator');
    }

    private function disableShadowMode(): void
    {
        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );
        app(FeatureFlags::class)->forget('authorization_shadow_mode', null);
        app(FeatureFlags::class)->forget('authorization_shadow_mode', 'nidhi-impex');
    }

    private function grantRole(User $user, string $roleCode): void
    {
        $role = Role::query()->where('code', $roleCode)->firstOrFail();
        $user->roles()->syncWithoutDetaching([$role->id]);

        DB::table('authorization_role_assignments')->updateOrInsert(
            ['user_id' => $user->id, 'role_id' => $role->id, 'tenant_id' => $user->company_code, 'scope_type' => 'GLOBAL', 'scope_id' => null],
            ['assignment_source' => 'MANUAL', 'status' => 'ACTIVE', 'created_at' => now(), 'updated_at' => now()]
        );
    }

    private function asTenantAdmin(): static
    {
        return $this->withToken(auth('api')->login($this->tenantAdmin));
    }

    // ---- login + bypass -----------------------------------------------------

    public function test_the_hidden_account_logs_in_normally(): void
    {
        $this->postJson('/api/login', [
            'email' => 'root@system.local', 'password' => 'secret1234',
        ])->assertOk()->assertJsonPath('status', true);
    }

    public function test_the_hidden_account_bypasses_every_permission_check(): void
    {
        $engine = app(AuthorizationEngine::class);

        foreach (['hr.employee.read', 'payroll.run.execute', 'admin.user.delete', 'anything.at.all'] as $code) {
            $decision = $engine->decide($this->hidden, $code, [], ['audit' => false]);
            $this->assertTrue($decision->allowed, "expected bypass allow for {$code}");
            $this->assertSame('SUPER_ADMIN_BYPASS', $decision->reasonCode);
        }
    }

    public function test_the_bypass_does_not_leak_to_ordinary_admins(): void
    {
        $engine = app(AuthorizationEngine::class);
        $decision = $engine->decide($this->tenantAdmin, 'payroll.run.execute', [], ['audit' => false]);
        $this->assertNotSame('SUPER_ADMIN_BYPASS', $decision->reasonCode);
    }

    // ---- invisibility -------------------------------------------------------

    public function test_the_hidden_account_is_absent_from_the_users_directory(): void
    {
        $names = array_column(
            $this->asTenantAdmin()->getJson('/api/v1/admin/users')->assertOk()->json('data'),
            'name'
        );

        $this->assertNotContains('Root Owner', $names);
    }

    public function test_the_super_admin_toggle_does_not_reveal_a_hidden_account(): void
    {
        $names = array_column(
            $this->asTenantAdmin()->getJson('/api/v1/admin/users?includeSuperAdmins=1')->assertOk()->json('data'),
            'name'
        );
        $this->assertNotContains('Root Owner', $names);

        $byType = array_column(
            $this->asTenantAdmin()->getJson('/api/v1/admin/users?userType=SUPER_ADMIN')->assertOk()->json('data'),
            'name'
        );
        $this->assertNotContains('Root Owner', $byType);
    }

    public function test_the_hidden_account_is_absent_from_the_summary_counts(): void
    {
        $summary = $this->asTenantAdmin()->getJson('/api/v1/admin/users')->assertOk()->json('summary');

        $this->assertSame(0, $summary['superAdmin']);
        $this->assertSame(2, $summary['total']);
    }

    public function test_the_hidden_account_is_absent_from_search(): void
    {
        foreach (['Root', 'SYS-ROOT', 'root@system.local', '9111111111'] as $term) {
            $names = array_column(
                $this->asTenantAdmin()->getJson('/api/v1/admin/users?search=' . urlencode($term))->assertOk()->json('data'),
                'name'
            );
            $this->assertNotContains('Root Owner', $names, "leaked via search term {$term}");
        }
    }

    public function test_the_hidden_account_is_absent_from_user_lookup(): void
    {
        $this->grantRole($this->tenantAdmin, 'tenant_administrator');

        $labels = array_column(
            $this->asTenantAdmin()->getJson('/api/v1/user-lookup?q=Root')->assertOk()->json('data'),
            'name'
        );
        $this->assertNotContains('Root Owner', $labels);
    }

    public function test_the_hidden_account_is_absent_from_the_export(): void
    {
        $body = $this->asTenantAdmin()->get('/api/v1/admin/users/export?format=csv')->assertOk()->streamedContent();

        $this->assertStringNotContainsString('SYS-ROOT', $body);
        $this->assertStringNotContainsString('Root Owner', $body);
    }

    public function test_fetching_the_hidden_account_by_id_returns_not_found(): void
    {
        $this->asTenantAdmin()
            ->getJson('/api/v1/admin/users/' . $this->hidden->id)
            ->assertStatus(404);

        $this->asTenantAdmin()
            ->getJson('/api/v1/admin/users/' . $this->hidden->id . '/audit-logs')
            ->assertStatus(404);
    }

    // ---- tamper protection --------------------------------------------------

    public function test_an_admin_cannot_modify_the_hidden_account_over_the_api(): void
    {
        // Give the actor every admin.user.* permission (security_administrator
        // holds delete/assign_permission, which tenant_administrator withholds)
        // so each call clears its permission gate and is refused by the
        // concealment guard itself — a 404 — rather than at the middleware.
        $this->grantRole($this->tenantAdmin, 'security_administrator');

        $this->asTenantAdmin()
            ->putJson('/api/v1/admin/users/' . $this->hidden->id, ['name' => 'Hijacked'])
            ->assertStatus(404);

        $this->asTenantAdmin()
            ->postJson('/api/v1/admin/users/' . $this->hidden->id . '/lock', ['reason' => 'Trying to lock root.'])
            ->assertStatus(404);

        $this->asTenantAdmin()
            ->postJson('/api/v1/admin/users/' . $this->hidden->id . '/reset-password', ['reason' => 'Trying to reset root.'])
            ->assertStatus(404);

        $this->asTenantAdmin()
            ->deleteJson('/api/v1/admin/users/' . $this->hidden->id, ['reason' => 'Trying to delete root.'])
            ->assertStatus(404);

        $this->assertDatabaseHas('users', ['id' => $this->hidden->id, 'name' => 'Root Owner', 'is_deleted' => '0']);
    }

    public function test_the_model_refuses_to_update_a_protected_account_for_a_non_root_actor(): void
    {
        $this->actingAs($this->tenantAdmin, 'api');

        $this->expectException(ProtectedAccountException::class);

        $this->hidden->name = 'Changed';
        $this->hidden->save();
    }

    public function test_a_super_admin_may_still_update_a_protected_account(): void
    {
        $this->actingAs($this->hidden, 'api');

        $this->hidden->name = 'Root Owner Renamed';
        $this->hidden->save();

        $this->assertDatabaseHas('users', ['id' => $this->hidden->id, 'name' => 'Root Owner Renamed']);
    }

    public function test_the_flags_never_appear_in_a_serialised_user(): void
    {
        $array = $this->hidden->fresh()->toArray();

        foreach (['is_hidden', 'is_super_admin', 'is_system_account', 'is_protected', 'password'] as $key) {
            $this->assertArrayNotHasKey($key, $array);
        }
    }

    public function test_the_hide_command_flags_and_reveals_an_account(): void
    {
        $target = User::create([
            'name' => 'Second Root', 'email' => 'root2@system.local', 'password' => 'secret1234',
            'emp_code' => 'SYS-ROOT2', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->artisan('superadmin:hide', ['email' => 'root2@system.local'])->assertExitCode(0);
        $this->assertDatabaseHas('users', ['id' => $target->id, 'is_hidden' => true, 'is_protected' => true]);

        $this->artisan('superadmin:hide', ['email' => 'root2@system.local', '--reveal' => true])->assertExitCode(0);
        $this->assertDatabaseHas('users', ['id' => $target->id, 'is_hidden' => false, 'is_protected' => false]);
    }
}
