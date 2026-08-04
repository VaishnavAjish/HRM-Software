<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\FeatureFlags;
use Database\Seeders\AdminUserManagementPermissionSeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AdminUserDirectoryApiTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private User $tenantAdmin;

    private User $employee;

    private User $otherCompany;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);
        $this->seed(AdminUserManagementPermissionSeeder::class);
        $this->disableShadowMode();

        $this->superAdmin = User::create([
            'name' => 'Root', 'email' => 'root@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->tenantAdmin = User::create([
            'name' => 'Tenant Admin', 'email' => 'tenant@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-TEN', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->employee = User::create([
            'name' => 'Asha Patel', 'email' => 'asha@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-1001', 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
            'department' => 'Polish', 'designation' => 'Worker', 'mobile_number' => '9000000001',
        ]);

        $this->otherCompany = User::create([
            'name' => 'Other Co', 'email' => 'other@test.local', 'password' => 'secret1234',
            'emp_code' => 'E-2001', 'role' => 3, 'company_code' => 'silver-star', 'status' => 0,
        ]);

        $this->grantRole($this->superAdmin, 'super_administrator');
        $this->grantRole($this->tenantAdmin, 'tenant_administrator');
    }

    private function disableShadowMode(): void
    {
        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );

        app(FeatureFlags::class)->forget('authorization_shadow_mode', null);

        foreach (['nidhi-impex', 'silver-star'] as $tenant) {
            app(FeatureFlags::class)->forget('authorization_shadow_mode', $tenant);
        }
    }

    private function grantRole(User $user, string $roleCode): void
    {
        $role = Role::query()->where('code', $roleCode)->firstOrFail();

        $user->roles()->syncWithoutDetaching([$role->id]);

        DB::table('authorization_role_assignments')->updateOrInsert(
            [
                'user_id' => $user->id, 'role_id' => $role->id,
                'tenant_id' => $user->company_code, 'scope_type' => 'GLOBAL', 'scope_id' => null,
            ],
            [
                'assignment_source' => 'MANUAL', 'status' => 'ACTIVE',
                'created_at' => now(), 'updated_at' => now(),
            ]
        );
    }

    private function asRoot(): static
    {
        return $this->withToken(auth('api')->login($this->superAdmin));
    }

    private function asTenantAdmin(): static
    {
        return $this->withToken(auth('api')->login($this->tenantAdmin));
    }

    private function asEmployee(): static
    {
        return $this->withToken(auth('api')->login($this->employee));
    }

    public function test_the_directory_is_refused_without_the_read_permission(): void
    {
        $this->asEmployee()->getJson('/api/v1/admin/users')->assertStatus(403);
    }

    public function test_the_directory_lists_users_with_a_summary(): void
    {
        $response = $this->asRoot()->getJson('/api/v1/admin/users')->assertOk();

        $this->assertSame(4, $response->json('summary.total'));
        $this->assertSame(4, $response->json('summary.active'));
        $this->assertSame(0, $response->json('summary.locked'));
        $this->assertSame(1, $response->json('summary.superAdmin'));
        $this->assertSame(1, $response->json('summary.admin'));
        $this->assertSame(2, $response->json('summary.employee'));
        $this->assertTrue($response->json('meta.administrationReady'));
    }

    public function test_the_global_search_matches_employee_id_and_name(): void
    {
        $byName = $this->asRoot()->getJson('/api/v1/admin/users?search=Asha')->assertOk();
        $this->assertSame(['Asha Patel'], array_column($byName->json('data'), 'name'));

        $byCode = $this->asRoot()->getJson('/api/v1/admin/users?search=E-1001')->assertOk();
        $this->assertSame(['Asha Patel'], array_column($byCode->json('data'), 'name'));
    }

    public function test_a_tenant_admin_only_sees_its_own_company(): void
    {
        $response = $this->asTenantAdmin()->getJson('/api/v1/admin/users')->assertOk();

        $this->assertSame(['nidhi-impex'], array_values(array_unique(array_column($response->json('data'), 'companyCode'))));
    }

    public function test_a_tenant_admin_cannot_read_a_user_outside_its_company(): void
    {
        $this->asTenantAdmin()
            ->getJson('/api/v1/admin/users/' . $this->otherCompany->id)
            ->assertStatus(403);
    }

    public function test_creating_a_user_rejects_a_duplicate_email(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Duplicate', 'email' => 'asha@test.local', 'empCode' => 'E-9999',
            'password' => 'secret1234', 'role' => 3, 'companyCode' => 'nidhi-impex',
        ])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_creating_a_user_rejects_a_duplicate_employee_id_username_and_mobile(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Duplicate', 'email' => 'fresh@test.local', 'empCode' => 'E-1001',
            'mobile' => '9000000001', 'password' => 'secret1234', 'role' => 3,
            'companyCode' => 'nidhi-impex',
        ])->assertStatus(422)->assertJsonValidationErrors(['empCode', 'mobile']);

        $this->employee->username = 'asha.patel';
        $this->employee->save();

        $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Duplicate', 'email' => 'fresh@test.local', 'empCode' => 'E-8888',
            'username' => 'asha.patel', 'password' => 'secret1234', 'role' => 3,
            'companyCode' => 'nidhi-impex',
        ])->assertStatus(422)->assertJsonValidationErrors('username');
    }

    public function test_creating_a_user_records_an_audit_entry(): void
    {
        $id = $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'New Joiner', 'email' => 'joiner@test.local', 'empCode' => 'E-3001',
            'username' => 'new.joiner', 'password' => 'secret1234', 'role' => 3,
            'companyCode' => 'nidhi-impex', 'department' => 'Polish',
            'businessReason' => 'Onboarding for the new shift.',
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('users', ['id' => $id, 'username' => 'new.joiner']);

        $this->assertDatabaseHas('authorization_permission_audit_logs', [
            'subject_type' => 'USER', 'subject_id' => (string) $id, 'change_type' => 'CREATE',
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'module' => 'access-control-users', 'action' => 'CREATE',
        ]);
    }

    public function test_only_a_super_admin_may_create_a_super_admin(): void
    {
        $this->asTenantAdmin()->postJson('/api/v1/admin/users', [
            'name' => 'Escalation', 'email' => 'escalate@test.local', 'empCode' => 'E-4001',
            'password' => 'secret1234', 'role' => 0, 'companyCode' => 'nidhi-impex',
        ])->assertStatus(403);
    }

    public function test_locking_a_user_records_the_reason_and_shows_as_locked(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/users/' . $this->employee->id . '/lock', [
            'reason' => 'Under investigation for a data export.',
        ])->assertOk();

        $this->employee->refresh();
        $this->assertNotNull($this->employee->locked_at);
        $this->assertSame($this->superAdmin->id, (int) $this->employee->locked_by);

        $summary = $this->asRoot()->getJson('/api/v1/admin/users')->assertOk();
        $this->assertSame(1, $summary->json('summary.locked'));
        $this->assertSame(3, $summary->json('summary.active'));

        $filtered = $this->asRoot()->getJson('/api/v1/admin/users?status=LOCKED')->assertOk();
        $this->assertSame(['Asha Patel'], array_column($filtered->json('data'), 'name'));

        $this->assertDatabaseHas('authorization_permission_audit_logs', [
            'subject_id' => (string) $this->employee->id,
            'change_type' => 'LOCK',
            'business_reason' => 'Under investigation for a data export.',
        ]);
    }

    public function test_locking_requires_a_reason(): void
    {
        $this->asRoot()
            ->postJson('/api/v1/admin/users/' . $this->employee->id . '/lock', ['reason' => 'no'])
            ->assertStatus(422);
    }

    public function test_a_locked_user_cannot_log_in_and_unlocking_restores_access(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/users/' . $this->employee->id . '/lock', [
            'reason' => 'Under investigation for a data export.',
        ])->assertOk();

        $this->postJson('/api/login', ['email' => 'asha@test.local', 'password' => 'secret1234'])
            ->assertStatus(403);

        $this->assertDatabaseHas('login_events', [
            'user_id' => $this->employee->id, 'result' => 'failed', 'reason' => 'account_locked',
        ]);

        $this->asRoot()->postJson('/api/v1/admin/users/' . $this->employee->id . '/unlock', [
            'reason' => 'Investigation closed.',
        ])->assertOk();

        $this->postJson('/api/login', ['email' => 'asha@test.local', 'password' => 'secret1234'])
            ->assertOk();

        $this->employee->refresh();
        $this->assertNull($this->employee->locked_at);
        $this->assertNotNull($this->employee->last_login_at);
    }

    public function test_deactivating_then_activating_moves_the_user_between_buckets(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/users/' . $this->employee->id . '/deactivate', [
            'reason' => 'On extended unpaid leave.',
        ])->assertOk();

        $this->assertSame(1, $this->asRoot()->getJson('/api/v1/admin/users')->assertOk()->json('summary.inactive'));

        $this->postJson('/api/login', ['email' => 'asha@test.local', 'password' => 'secret1234'])
            ->assertStatus(403);

        $this->asRoot()->postJson('/api/v1/admin/users/' . $this->employee->id . '/activate', [
            'reason' => 'Returned from leave.',
        ])->assertOk();

        $summary = $this->asRoot()->getJson('/api/v1/admin/users')->assertOk();
        $this->assertSame(0, $summary->json('summary.inactive'));
        $this->assertSame(4, $summary->json('summary.active'));
    }

    public function test_you_cannot_lock_or_delete_your_own_account(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/users/' . $this->superAdmin->id . '/lock', [
            'reason' => 'Testing the self guard.',
        ])->assertStatus(422);

        $this->asRoot()->deleteJson('/api/v1/admin/users/' . $this->superAdmin->id, [
            'reason' => 'Testing the self guard.',
        ])->assertStatus(422);
    }

    public function test_a_tenant_admin_cannot_change_a_super_admin(): void
    {
        // Super admins are protected accounts, so they are concealed from a
        // non-root admin entirely — 404, not a 403 that would confirm the row
        // exists. Either way the account cannot be changed.
        $this->asTenantAdmin()->putJson('/api/v1/admin/users/' . $this->superAdmin->id, [
            'name' => 'Hijacked',
        ])->assertStatus(404);
    }

    public function test_a_soft_deleted_user_leaves_the_default_listing(): void
    {
        $this->asRoot()->deleteJson('/api/v1/admin/users/' . $this->employee->id, [
            'reason' => 'Left the company.',
        ])->assertOk();

        $listing = $this->asRoot()->getJson('/api/v1/admin/users')->assertOk();
        $this->assertNotContains('Asha Patel', array_column($listing->json('data'), 'name'));

        $deleted = $this->asRoot()->getJson('/api/v1/admin/users?status=DELETED')->assertOk();
        $this->assertSame(['Asha Patel'], array_column($deleted->json('data'), 'name'));
    }

    public function test_resetting_a_password_issues_one_and_changes_the_hash(): void
    {
        $before = $this->employee->password;

        $issued = $this->asRoot()
            ->postJson('/api/v1/admin/users/' . $this->employee->id . '/reset-password', [
                'reason' => 'User reported a lost password.',
            ])
            ->assertOk()
            ->json('data.temporaryPassword');

        $this->assertNotEmpty($issued);

        $this->employee->refresh();
        $this->assertNotSame($before, $this->employee->password);
        $this->assertTrue(Hash::check($issued, $this->employee->password));

        $this->assertDatabaseHas('authorization_permission_audit_logs', [
            'subject_id' => (string) $this->employee->id, 'change_type' => 'PASSWORD_RESET',
        ]);
    }

    public function test_assigning_roles_replaces_the_set_and_is_audited(): void
    {
        $hrManager = Role::query()->where('code', 'hr_manager')->firstOrFail();

        $this->asRoot()->postJson('/api/v1/admin/users/' . $this->employee->id . '/assign-role', [
            'roleIds' => [$hrManager->id], 'reason' => 'Promoted into the HR team.',
        ])->assertOk();

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $this->employee->id, 'role_id' => $hrManager->id,
        ]);

        $this->assertDatabaseHas('authorization_role_assignments', [
            'user_id' => $this->employee->id, 'role_id' => $hrManager->id, 'status' => 'ACTIVE',
        ]);

        $this->assertDatabaseHas('authorization_permission_audit_logs', [
            'subject_id' => (string) $this->employee->id, 'change_type' => 'ROLE_ASSIGNMENT',
        ]);

        $this->assertSame(1, $this->asRoot()->getJson('/api/v1/admin/users')->assertOk()->json('summary.hr'));
    }

    public function test_a_tenant_admin_cannot_assign_a_system_role(): void
    {
        $securityAdmin = Role::query()->where('code', 'security_administrator')->firstOrFail();

        $this->asTenantAdmin()->postJson('/api/v1/admin/users/' . $this->employee->id . '/assign-role', [
            'roleIds' => [$securityAdmin->id], 'reason' => 'Attempted escalation.',
        ])->assertStatus(403);
    }

    public function test_assigning_direct_permissions_is_stored_and_audited(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'hr.employee.read')->value('id');

        $this->asRoot()->postJson('/api/v1/admin/users/' . $this->employee->id . '/assign-permissions', [
            'permissions' => [['permissionId' => $permissionId, 'isDenied' => false]],
            'reason' => 'Temporary directory access.',
        ])->assertOk();

        $this->assertDatabaseHas('user_permissions', [
            'user_id' => $this->employee->id, 'permission_id' => $permissionId, 'is_denied' => false,
        ]);

        $this->assertDatabaseHas('authorization_permission_audit_logs', [
            'subject_id' => (string) $this->employee->id, 'change_type' => 'PERMISSION_ASSIGNMENT',
        ]);
    }

    public function test_assigning_permissions_needs_its_own_permission(): void
    {
        $permissionId = DB::table('permissions')->where('name', 'hr.employee.read')->value('id');

        $this->asTenantAdmin()->postJson('/api/v1/admin/users/' . $this->employee->id . '/assign-permissions', [
            'permissions' => [['permissionId' => $permissionId]],
        ])->assertStatus(403);
    }

    public function test_the_detail_view_carries_every_drawer_section(): void
    {
        $detail = $this->asRoot()
            ->getJson('/api/v1/admin/users/' . $this->employee->id)
            ->assertOk()
            ->json('data');

        foreach ([
            'personal', 'employment', 'roles', 'permissions', 'departments',
            'branches', 'reportingManager', 'loginHistory', 'auditHistory', 'recentActivity',
        ] as $section) {
            $this->assertArrayHasKey($section, $detail);
        }
    }

    public function test_a_bulk_action_applies_to_every_selected_user(): void
    {
        $response = $this->asRoot()->postJson('/api/v1/admin/users/bulk', [
            'action' => 'deactivate',
            'userIds' => [$this->employee->id, $this->otherCompany->id],
            'reason' => 'Seasonal shutdown of the polish floor.',
        ])->assertOk();

        $this->assertCount(2, $response->json('data.applied'));
        $this->assertSame(2, $this->asRoot()->getJson('/api/v1/admin/users')->assertOk()->json('summary.inactive'));
    }

    public function test_a_bulk_action_skips_users_outside_the_callers_scope(): void
    {
        $response = $this->asTenantAdmin()->postJson('/api/v1/admin/users/bulk', [
            'action' => 'deactivate',
            'userIds' => [$this->employee->id, $this->otherCompany->id],
            'reason' => 'Seasonal shutdown of the polish floor.',
        ])->assertOk();

        $this->assertSame([$this->employee->id], $response->json('data.applied'));
        $this->assertSame([$this->otherCompany->id], array_column($response->json('data.skipped'), 'id'));
    }

    public function test_the_export_streams_a_csv_of_the_filtered_rows(): void
    {
        $response = $this->asRoot()->get('/api/v1/admin/users/export?format=csv&search=Asha');
        $response->assertOk();
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

        $body = $response->streamedContent();
        $this->assertStringContainsString('Employee ID', $body);
        $this->assertStringContainsString('Asha Patel', $body);
        $this->assertStringNotContainsString('Other Co', $body);
    }

    public function test_the_filter_options_endpoint_lists_the_axes_the_screen_needs(): void
    {
        $data = $this->asRoot()->getJson('/api/v1/admin/users/filter-options')->assertOk()->json('data');

        $this->assertContains('Polish', $data['departments']);
        $this->assertContains('Worker', $data['designations']);
        $this->assertContains('ACTIVE', $data['statuses']);
        $this->assertContains('SUPER_ADMIN', $data['userTypes']);
        $this->assertNotEmpty($data['roles']);
    }

    public function test_super_admins_are_hidden_from_the_listing_by_default(): void
    {
        $response = $this->asRoot()->getJson('/api/v1/admin/users')->assertOk();

        $this->assertNotContains('Root', array_column($response->json('data'), 'name'));
        $this->assertFalse($response->json('meta.includesSuperAdmins'));

        $this->assertSame(1, $response->json('summary.superAdmin'));
        $this->assertSame(4, $response->json('summary.total'));
    }

    public function test_the_toggle_reveals_super_admins(): void
    {
        $response = $this->asRoot()->getJson('/api/v1/admin/users?includeSuperAdmins=1')->assertOk();

        $this->assertContains('Root', array_column($response->json('data'), 'name'));
        $this->assertTrue($response->json('meta.includesSuperAdmins'));
    }

    public function test_filtering_by_super_admin_user_type_reveals_them_without_the_toggle(): void
    {
        $response = $this->asRoot()->getJson('/api/v1/admin/users?userType=SUPER_ADMIN')->assertOk();

        $this->assertSame(['Root'], array_column($response->json('data'), 'name'));
    }

    public function test_the_export_hides_super_admins_by_default(): void
    {
        $body = $this->asRoot()->get('/api/v1/admin/users/export?format=csv')->assertOk()->streamedContent();
        $this->assertStringNotContainsString('E-ROOT', $body);

        $withThem = $this->asRoot()
            ->get('/api/v1/admin/users/export?format=csv&includeSuperAdmins=1')
            ->assertOk()
            ->streamedContent();
        $this->assertStringContainsString('E-ROOT', $withThem);
    }

    public function test_the_user_type_filter_narrows_by_legacy_account_type(): void
    {
        $response = $this->asRoot()->getJson('/api/v1/admin/users?userType=ADMIN')->assertOk();

        $this->assertSame(['Tenant Admin'], array_column($response->json('data'), 'name'));
    }
}
