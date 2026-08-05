<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Support\RoleHierarchy;
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
    private User $superAdmin;

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

        // Role mutation is gated on being the super administrator, not on
        // holding admin.role.*, so the positive cases need a role-0 account.
        // $admin stays a tenant administrator on purpose: it is the subject of
        // the denial tests below.
        $this->superAdmin = User::create([
            'name' => 'Root', 'email' => 'root@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $this->grantRole($this->superAdmin, 'tenant_administrator');
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
        return $this->withToken(auth('api')->login($this->superAdmin));
    }

    /** A tenant administrator: every role permission, but not the super admin. */
    private function asTenantAdmin(): static
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

    /*
     * The point of the super-admin gate: a tenant administrator holds every
     * admin.role.* permission and still cannot mutate a role. If these ever
     * pass with 2xx, the permission check has been allowed to authorise its
     * own escalation again.
     */
    /*
     * The hierarchy: an administrator manages the tiers below it and nothing
     * else. These pin both halves — what Admin may do, and the boundary it must
     * not cross — because a rule that only tests the denial can be satisfied by
     * denying everything.
     */
    public function test_an_administrator_may_manage_lower_roles(): void
    {
        $this->asTenantAdmin()
            ->postJson('/api/v1/roles', ['name' => 'Floor Supervisor', 'roleType' => 'BUSINESS'])
            ->assertStatus(201);

        $custom = Role::query()->where('code', 'hr_manager')->firstOrFail();

        $this->asTenantAdmin()
            ->putJson("/api/v1/roles/{$custom->id}", ['name' => 'People Manager'])
            ->assertStatus(200);
    }

    public function test_an_administrator_cannot_manage_the_admin_tier(): void
    {
        $admin = Role::query()->where('code', 'tenant_administrator')->firstOrFail();

        foreach ([
            ['putJson', "/api/v1/roles/{$admin->id}", ['name' => 'Renamed Admin']],
            ['deleteJson', "/api/v1/roles/{$admin->id}", []],
            ['postJson', "/api/v1/roles/{$admin->id}/archive", []],
            ['postJson', "/api/v1/roles/{$admin->id}/deactivate", []],
        ] as [$method, $url, $payload]) {
            $this->asTenantAdmin()->{$method}($url, $payload)
                ->assertStatus(403)
                ->assertJson(['code' => 'ROLE_MANAGEMENT_FORBIDDEN']);
        }

        $this->assertDatabaseHas('roles', ['id' => $admin->id, 'name' => 'Admin']);
    }

    public function test_an_administrator_does_not_see_the_admin_tier_in_the_list(): void
    {
        $body = $this->asTenantAdmin()->getJson('/api/v1/roles/manage')->assertOk()->json();
        $codes = collect($body['data'] ?? [])->pluck('code')->all();

        $this->assertNotContains('tenant_administrator', $codes, 'Admin tier must not be listed');
        $this->assertNotContains('super_administrator', $codes, 'hidden identity must not be listed');
        $this->assertContains('hr_manager', $codes, 'lower tiers must still be listed');
    }

    public function test_the_super_admin_sees_the_admin_tier_but_never_itself(): void
    {
        $body = $this->asAdmin()->getJson('/api/v1/roles/manage')->assertOk()->json();
        $codes = collect($body['data'] ?? [])->pluck('code')->all();

        $this->assertContains('tenant_administrator', $codes);
        $this->assertNotContains('super_administrator', $codes);
    }

    public function test_an_employee_is_refused_the_role_management_surface(): void
    {
        $employee = User::create([
            'name' => 'Worker', 'email' => 'worker@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-WRK', 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->withToken(auth('api')->login($employee))
            ->postJson('/api/v1/roles', ['name' => 'Nope', 'roleType' => 'BUSINESS'])
            ->assertStatus(403)
            ->assertJson(['code' => 'ROLE_MANAGEMENT_FORBIDDEN']);
    }

    public function test_a_role_merely_named_super_admin_grants_nothing(): void
    {
        // Identity is the code, never the display name. A role whose name
        // reads as the super administrator must not confer its access.
        // An exact duplicate is impossible anyway — roles_name_unique blocks
        // it — so the near-miss name is the case actually worth pinning.
        $impostor = Role::create([
            'name' => 'Super Admin (Operations)', 'code' => 'not_really_super', 'role_type' => 'BUSINESS',
            'status' => 'ACTIVE', 'is_active' => true, 'is_system' => false,
        ]);
        $user = User::create([
            'name' => 'Impostor', 'email' => 'imp@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-IMP', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $this->grantRole($user, 'not_really_super');

        $this->withToken(auth('api')->login($user))
            ->postJson('/api/v1/roles', ['name' => 'Nope', 'roleType' => 'BUSINESS'])
            ->assertStatus(403);

        $this->assertNotNull($impostor->id);
    }

    public function test_the_protected_role_cannot_be_deactivated_or_archived_even_by_the_super_admin(): void
    {
        $protected = Role::query()->where('code', 'super_administrator')->firstOrFail();

        // Concealed from this surface entirely, so every write answers 404
        // rather than confirming the record exists.
        foreach (['archive', 'deactivate'] as $action) {
            $status = $this->asAdmin()
                ->postJson("/api/v1/roles/{$protected->id}/{$action}")
                ->getStatusCode();

            $this->assertContains($status, [404, 409], "{$action} must not succeed");
        }

        $this->assertDatabaseHas('roles', ['id' => $protected->id, 'status' => 'ACTIVE']);
    }

    public function test_deleting_an_assigned_role_reports_the_assigned_count(): void
    {
        $role = Role::create([
            'name' => 'Busy', 'code' => 'busy_role', 'role_type' => 'BUSINESS',
            'status' => 'ACTIVE', 'is_active' => true, 'is_system' => false,
        ]);
        $this->grantRole($this->admin, 'busy_role');

        $this->asAdmin()->deleteJson("/api/v1/roles/{$role->id}")
            ->assertStatus(409)
            ->assertJson(['success' => false, 'code' => 'ROLE_HAS_ASSIGNED_USERS'])
            ->assertJsonStructure(['assignedUserCount']);

        $this->assertDatabaseHas('roles', ['id' => $role->id]);
    }

    /* ---- creation-class escalation (the highest-priority hole) ---------- */

    public function test_an_administrator_cannot_mint_a_reserved_code(): void
    {
        // super_admin is absent from this database, so uniqueness does not stop
        // it - and RoleHierarchy maps that code to the internal identity.
        $this->asTenantAdmin()
            ->postJson('/api/v1/roles', ['name' => 'Minted Root', 'code' => 'super_admin'])
            ->assertStatus(403)
            ->assertJson(['code' => 'ROLE_CLASS_CREATION_FORBIDDEN']);

        $this->assertDatabaseMissing('roles', ['code' => 'super_admin']);
    }

    public function test_reserved_code_normalisation_defeats_casing_and_separators(): void
    {
        $zeroWidth = "super\xE2\x80\x8B_admin";

        foreach (['SUPER_ADMIN', ' super admin ', 'super-admin', 'Super_Admin', $zeroWidth] as $variant) {
            $this->assertTrue(
                RoleHierarchy::isReservedCode($variant),
                "[{$variant}] must normalise onto a reserved code"
            );
        }

        $this->assertFalse(RoleHierarchy::isReservedCode('floor_supervisor'));
    }

    public function test_the_super_admin_also_cannot_mint_the_internal_identity(): void
    {
        $this->asAdmin()
            ->postJson('/api/v1/roles', ['name' => 'Second Root', 'code' => 'super_admin'])
            ->assertStatus(403)
            ->assertJson(['code' => 'ROLE_CLASS_CREATION_FORBIDDEN']);
    }

    public function test_a_client_supplied_tenant_is_ignored_on_create(): void
    {
        $this->asTenantAdmin()
            ->postJson('/api/v1/roles', ['name' => 'Scoped Role', 'tenantId' => 'someone-elses-tenant'])
            ->assertStatus(201);

        $this->assertDatabaseMissing('roles', [
            'name' => 'Scoped Role', 'tenant_id' => 'someone-elses-tenant',
        ]);
    }

    public function test_an_unknown_code_always_classifies_as_custom(): void
    {
        // role_class=ADMIN written straight into the row, but the code is
        // unknown, so the class is CUSTOM and the row confers no authority.
        $role = Role::create([
            'name' => 'Looks Important', 'code' => 'looks_important', 'role_class' => 'ADMIN',
            'status' => 'ACTIVE', 'is_active' => true, 'is_system' => false,
        ]);

        $this->assertSame('CUSTOM', RoleHierarchy::classOf($role->fresh()));
    }

    /* ---- clone and matrix target authorisation -------------------------- */

    public function test_an_administrator_cannot_clone_or_open_the_admin_matrix(): void
    {
        $admin = Role::query()->where('code', 'tenant_administrator')->firstOrFail();

        $this->asTenantAdmin()->getJson("/api/v1/roles/{$admin->id}/matrix")
            ->assertStatus(403)->assertJson(['code' => 'ROLE_MANAGEMENT_FORBIDDEN']);

        $this->asTenantAdmin()->putJson("/api/v1/roles/{$admin->id}/matrix", ['changes' => []])
            ->assertStatus(403);

        $this->asTenantAdmin()->postJson("/api/v1/roles/{$admin->id}/clone", ['name' => 'Admin Copy'])
            ->assertStatus(403);

        $this->assertDatabaseMissing('roles', ['name' => 'Admin Copy']);
    }

    public function test_an_administrator_may_still_open_a_lower_matrix(): void
    {
        $custom = Role::query()->where('code', 'hr_manager')->firstOrFail();

        $this->asTenantAdmin()->getJson("/api/v1/roles/{$custom->id}/matrix")->assertOk();
    }

    public function test_the_hidden_identity_answers_404_on_the_matrix(): void
    {
        $hidden = Role::query()->where('code', 'super_administrator')->firstOrFail();

        $this->asAdmin()->getJson("/api/v1/roles/{$hidden->id}/matrix")->assertStatus(404);
        $this->asTenantAdmin()->getJson("/api/v1/roles/{$hidden->id}/matrix")->assertStatus(404);
    }

    /* ---- user role assignment: the escalation the deny-list allowed ------ */

    private function makeEmployee(string $suffix): User
    {
        return User::create([
            'name' => 'Worker ' . $suffix, 'email' => "w{$suffix}@test.local",
            'password' => 'secret1234', 'emp_code' => 'E-W' . $suffix,
            'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    public function test_an_administrator_cannot_grant_the_admin_role(): void
    {
        $victim = $this->makeEmployee('A1');
        $adminRole = Role::query()->where('code', 'tenant_administrator')->firstOrFail();

        $this->asTenantAdmin()
            ->postJson("/api/v1/admin/users/{$victim->id}/assign-role", ['roleIds' => [$adminRole->id]])
            ->assertStatus(403)
            ->assertJson(['code' => 'ROLE_ASSIGNMENT_FORBIDDEN']);

        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $victim->id, 'role_id' => $adminRole->id,
        ]);
    }

    public function test_an_administrator_cannot_grant_the_hidden_identity(): void
    {
        $victim = $this->makeEmployee('A2');
        $hidden = Role::query()->where('code', 'super_administrator')->firstOrFail();

        $this->asTenantAdmin()
            ->postJson("/api/v1/admin/users/{$victim->id}/assign-role", ['roleIds' => [$hidden->id]])
            ->assertStatus(403);

        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $victim->id, 'role_id' => $hidden->id,
        ]);
    }

    public function test_an_administrator_may_grant_a_lower_role(): void
    {
        $victim = $this->makeEmployee('A3');
        $custom = Role::query()->where('code', 'hr_manager')->firstOrFail();

        $this->asTenantAdmin()
            ->postJson("/api/v1/admin/users/{$victim->id}/assign-role", ['roleIds' => [$custom->id]])
            ->assertStatus(200);

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $victim->id, 'role_id' => $custom->id,
        ]);
    }

    public function test_an_administrator_cannot_modify_their_own_roles(): void
    {
        $custom = Role::query()->where('code', 'hr_manager')->firstOrFail();

        $this->asTenantAdmin()
            ->postJson("/api/v1/admin/users/{$this->admin->id}/assign-role", ['roleIds' => [$custom->id]])
            ->assertStatus(403)
            ->assertJson(['code' => 'TARGET_USER_ROLE_PROTECTED']);
    }

    public function test_an_administrator_cannot_strip_roles_from_a_peer(): void
    {
        $peer = User::create([
            'name' => 'Peer Admin', 'email' => 'peer@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-PEER', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
        $this->grantRole($peer, 'tenant_administrator');

        // Demotion crosses the same boundary as promotion, in reverse.
        $this->asTenantAdmin()
            ->postJson("/api/v1/admin/users/{$peer->id}/assign-role", ['roleIds' => []])
            ->assertStatus(403)
            ->assertJson(['code' => 'TARGET_USER_ROLE_PROTECTED']);
    }

    public function test_the_bulk_endpoint_enforces_the_same_hierarchy(): void
    {
        $victim = $this->makeEmployee('A4');
        $adminRole = Role::query()->where('code', 'tenant_administrator')->firstOrFail();

        // This path previously ran guardTarget() but never guardSensitiveRoles(),
        // so it could grant any role to a list of users in one request.
        $this->asTenantAdmin()->postJson('/api/v1/admin/users/bulk', [
            'action' => 'assign-role',
            'userIds' => [$victim->id],
            'roleIds' => [$adminRole->id],
        ]);

        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $victim->id, 'role_id' => $adminRole->id,
        ]);
    }

    public function test_a_user_is_classified_by_their_highest_role(): void
    {
        $mixed = $this->makeEmployee('A5');
        $this->grantRole($mixed, 'employee');
        $this->grantRole($mixed, 'tenant_administrator');

        // Reading whichever row came back first would classify this account as
        // an employee and expose it to modification by its peers.
        $this->assertSame(
            RoleHierarchy::ADMIN,
            RoleHierarchy::userClass($mixed->fresh()),
            'highest role must win, not the first row returned'
        );
    }

    public function test_the_super_admin_may_still_grant_the_admin_role(): void
    {
        $victim = $this->makeEmployee('A6');
        $adminRole = Role::query()->where('code', 'tenant_administrator')->firstOrFail();

        $this->asAdmin()
            ->postJson("/api/v1/admin/users/{$victim->id}/assign-role", ['roleIds' => [$adminRole->id]])
            ->assertStatus(200);

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $victim->id, 'role_id' => $adminRole->id,
        ]);
    }

    /* ---- the super admin owns every visible tier ------------------------ */

    public function test_the_super_admin_can_delete_a_system_role(): void
    {
        $security = Role::query()->where('code', 'security_administrator')->firstOrFail();
        $this->assertTrue((bool) $security->is_system, 'precondition: flagged system');

        $this->asAdmin()->deleteJson("/api/v1/roles/{$security->id}")->assertOk();

        $this->assertDatabaseMissing('roles', ['id' => $security->id]);
    }

    public function test_the_super_admin_can_delete_the_admin_tier(): void
    {
        $admin = Role::query()->where('code', 'tenant_administrator')->firstOrFail();

        // setUp() assigns this role to the test administrator, and the
        // assigned-users rule outranks the tier rule. Detach first so the test
        // exercises the tier boundary rather than the dependency check.
        DB::table('user_roles')->where('role_id', $admin->id)->delete();
        DB::table('authorization_role_assignments')->where('role_id', $admin->id)->delete();

        $this->asAdmin()->deleteJson("/api/v1/roles/{$admin->id}")->assertOk();

        $this->assertDatabaseMissing('roles', ['id' => $admin->id]);
    }

    public function test_the_super_admin_can_change_a_system_roles_status(): void
    {
        $security = Role::query()->where('code', 'security_administrator')->firstOrFail();

        $this->asAdmin()->postJson("/api/v1/roles/{$security->id}/deactivate")->assertOk();
        $this->assertDatabaseHas('roles', ['id' => $security->id, 'status' => 'INACTIVE']);

        $this->asAdmin()->postJson("/api/v1/roles/{$security->id}/activate")->assertOk();
        $this->assertDatabaseHas('roles', ['id' => $security->id, 'status' => 'ACTIVE']);
    }

    public function test_an_administrator_still_cannot_delete_a_system_role(): void
    {
        $security = Role::query()->where('code', 'security_administrator')->firstOrFail();

        // Refused with ROLE_IS_SYSTEM rather than a hierarchy 403:
        // security_administrator carries no mapped code, so it classifies as
        // CUSTOM and passes the tier check. The system flag is what stops it,
        // and that flag is only waived for the super administrator.
        $this->asTenantAdmin()->deleteJson("/api/v1/roles/{$security->id}")
            ->assertStatus(409)
            ->assertJson(['code' => 'ROLE_IS_SYSTEM']);

        $this->assertDatabaseHas('roles', ['id' => $security->id]);
    }

    public function test_the_hidden_identity_remains_undeletable_by_everyone(): void
    {
        $hidden = Role::query()->where('code', 'super_administrator')->firstOrFail();

        // Concealed from this surface, so a write answers 404 rather than
        // confirming the record exists. Either way it survives.
        $this->asAdmin()->deleteJson("/api/v1/roles/{$hidden->id}")->assertStatus(404);
        $this->asTenantAdmin()->deleteJson("/api/v1/roles/{$hidden->id}")->assertStatus(404);

        $this->assertDatabaseHas('roles', ['id' => $hidden->id, 'code' => 'super_administrator']);
    }

    public function test_a_system_role_with_users_still_reports_the_conflict(): void
    {
        $security = Role::query()->where('code', 'security_administrator')->firstOrFail();
        $this->grantRole($this->admin, 'security_administrator');

        // Relaxing the system-role rule must not relax the data-integrity rule.
        $this->asAdmin()->deleteJson("/api/v1/roles/{$security->id}")
            ->assertStatus(409)
            ->assertJson(['code' => 'ROLE_HAS_ASSIGNED_USERS']);

        $this->assertDatabaseHas('roles', ['id' => $security->id]);
    }
}
