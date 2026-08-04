<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\FeatureFlags;
use Database\Seeders\AdminUserManagementPermissionSeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RoleManagementApiTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);
        $this->seed(AdminUserManagementPermissionSeeder::class);
        $this->disableShadowMode();

        $this->admin = User::create([
            'name' => 'Tenant Admin', 'email' => 'tenant@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-TEN', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->grantRole($this->admin, 'tenant_administrator');
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

    private function asAdmin(): static
    {
        return $this->withToken(auth('api')->login($this->admin));
    }

    public function test_it_lists_roles_and_conceals_the_protected_system_role(): void
    {
        $codes = array_column(
            $this->asAdmin()->getJson('/api/v1/roles/manage')->assertOk()->json('data'),
            'code'
        );

        $this->assertContains('tenant_administrator', $codes);
        $this->assertContains('employee', $codes);
        $this->assertNotContains('super_administrator', $codes);
    }

    public function test_the_summary_excludes_the_protected_system_role(): void
    {
        $summary = $this->asAdmin()->getJson('/api/v1/roles/summary')->assertOk()->json('data');

        $everyRole = Role::query()->count();
        $this->assertSame($everyRole - 1, $summary['total']);
    }

    public function test_it_creates_a_custom_role(): void
    {
        $response = $this->asAdmin()->postJson('/api/v1/roles', [
            'name' => 'Packing Supervisor',
            'roleType' => 'OPERATIONAL',
            'defaultScopeType' => 'COMPANY',
        ])->assertCreated();

        $id = $response->json('data.id');

        $this->assertDatabaseHas('roles', ['id' => $id, 'name' => 'Packing Supervisor', 'type' => 'Custom', 'is_system' => false]);
        $this->assertSame('packing_supervisor', $response->json('data.code'));
    }

    public function test_it_updates_a_custom_role(): void
    {
        $role = Role::create(['name' => 'Quality Inspector', 'code' => 'quality_inspector', 'type' => 'Custom', 'is_active' => true, 'status' => 'ACTIVE']);

        $this->asAdmin()
            ->putJson("/api/v1/roles/{$role->id}", ['description' => 'Inspects finished goods'])
            ->assertOk()
            ->assertJsonPath('data.description', 'Inspects finished goods');
    }

    public function test_it_clones_a_role_with_its_permissions(): void
    {
        $source = Role::query()->where('code', 'hr_manager')->firstOrFail();
        $sourcePermissions = DB::table('role_permissions')->where('role_id', $source->id)->count();

        $response = $this->asAdmin()->postJson("/api/v1/roles/{$source->id}/clone", [
            'name' => 'Senior HR Manager',
        ])->assertCreated();

        $cloneId = $response->json('data.id');
        $this->assertSame($sourcePermissions, DB::table('role_permissions')->where('role_id', $cloneId)->count());
    }

    public function test_it_archives_and_restores_a_role(): void
    {
        $role = Role::create(['name' => 'Seasonal Worker', 'code' => 'seasonal_worker', 'type' => 'Custom', 'is_active' => true, 'status' => 'ACTIVE']);

        $this->asAdmin()->postJson("/api/v1/roles/{$role->id}/archive")->assertOk();
        $this->assertDatabaseHas('roles', ['id' => $role->id, 'status' => 'ARCHIVED', 'is_active' => false]);

        $this->asAdmin()->postJson("/api/v1/roles/{$role->id}/restore")->assertOk();
        $this->assertDatabaseHas('roles', ['id' => $role->id, 'status' => 'ACTIVE', 'is_active' => true]);
    }

    public function test_it_deletes_an_unassigned_custom_role(): void
    {
        $role = Role::create(['name' => 'Temp Role', 'code' => 'temp_role', 'type' => 'Custom', 'is_active' => true, 'status' => 'ACTIVE']);

        $this->asAdmin()->deleteJson("/api/v1/roles/{$role->id}")->assertOk();
        $this->assertDatabaseMissing('roles', ['id' => $role->id]);
    }

    public function test_it_refuses_to_delete_a_role_that_is_still_assigned(): void
    {
        $role = Role::create(['name' => 'Assigned Role', 'code' => 'assigned_role', 'type' => 'Custom', 'is_active' => true, 'status' => 'ACTIVE']);

        DB::table('authorization_role_assignments')->insert([
            'user_id' => $this->admin->id, 'role_id' => $role->id, 'tenant_id' => 'nidhi-impex',
            'scope_type' => 'TENANT', 'status' => 'ACTIVE', 'assignment_source' => 'MANUAL',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->asAdmin()->deleteJson("/api/v1/roles/{$role->id}")->assertStatus(409);
        $this->assertDatabaseHas('roles', ['id' => $role->id]);
    }

    public function test_the_protected_system_role_cannot_be_fetched_updated_or_deleted(): void
    {
        $system = Role::query()->where('code', 'super_administrator')->firstOrFail();

        $this->asAdmin()->getJson("/api/v1/roles/{$system->id}")->assertStatus(404);
        $this->asAdmin()->putJson("/api/v1/roles/{$system->id}", ['name' => 'Hijacked'])->assertStatus(404);
        $this->asAdmin()->deleteJson("/api/v1/roles/{$system->id}")->assertStatus(404);

        $this->assertDatabaseHas('roles', ['id' => $system->id, 'code' => 'super_administrator']);
    }

    public function test_a_seeded_system_role_cannot_be_deleted(): void
    {
        $tenantAdmin = Role::query()->where('code', 'tenant_administrator')->firstOrFail();

        $this->asAdmin()->deleteJson("/api/v1/roles/{$tenantAdmin->id}")->assertStatus(409);
        $this->assertDatabaseHas('roles', ['id' => $tenantAdmin->id]);
    }
}
