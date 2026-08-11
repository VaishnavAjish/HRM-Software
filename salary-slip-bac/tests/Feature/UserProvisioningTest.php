<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\FeatureFlags;
use App\Support\ProvisioningContext;
use Database\Seeders\AdminUserManagementPermissionSeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * The rules that make Create and Edit different screens, and the ones that make
 * every creation path produce the same account.
 *
 * The security-relevant half is the manipulated request: hiding Employee in the
 * dropdown is a convenience, and a test that only checked the dropdown would
 * pass while the API happily minted employees for anyone who read the network
 * tab.
 */
class UserProvisioningTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private User $tenantAdmin;

    private User $employee;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);
        $this->seed(AdminUserManagementPermissionSeeder::class);

        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );
        app(FeatureFlags::class)->forget('authorization_shadow_mode', null);

        foreach (['nidhi-impex', 'silver-star'] as $tenant) {
            app(FeatureFlags::class)->forget('authorization_shadow_mode', $tenant);
        }

        $this->seedCompanies();

        $this->superAdmin = User::create([
            'name' => 'Root', 'email' => 'root@prov.local', 'password' => 'secret1234',
            'emp_code' => 'P-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->tenantAdmin = User::create([
            'name' => 'Tenant Admin', 'email' => 'tenant@prov.local', 'password' => 'secret1234',
            'emp_code' => 'P-TEN', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->employee = User::create([
            'name' => 'Asha Patel', 'email' => 'asha@prov.local', 'password' => 'secret1234',
            'emp_code' => 'P-1001', 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->grant($this->superAdmin, 'super_administrator');
        $this->grant($this->tenantAdmin, 'tenant_administrator');
        $this->grant($this->employee, 'employee');
    }

    private function seedCompanies(): void
    {
        foreach ([['nidhi-impex', 'Nidhi Impex'], ['silver-star', 'Silver Star']] as [$code, $name]) {
            DB::table('companies')->updateOrInsert(
                ['code' => $code],
                ['name' => $name, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]
            );
        }

        // Companies are created here, after the migration ran, so the unit
        // definitions have to be seeded now rather than by the migration.
        $this->seed(\Database\Seeders\UnitDefinitionSeeder::class);
    }

    private function grant(User $user, string $code): void
    {
        $user->roles()->syncWithoutDetaching([$this->roleId($code)]);
    }

    private function roleId(string $code): int
    {
        return (int) Role::query()->where('code', $code)->firstOrFail()->id;
    }

    private function companyId(string $code): int
    {
        return (int) DB::table('companies')->where('code', $code)->value('id');
    }

    private function asRoot(): static
    {
        return $this->withToken(auth('api')->login($this->superAdmin));
    }

    private function asTenantAdmin(): static
    {
        return $this->withToken(auth('api')->login($this->tenantAdmin));
    }

    // ── The two lists ────────────────────────────────────────────────────────

    public function test_direct_create_omits_the_employee_role_and_edit_includes_it(): void
    {
        $create = $this->asRoot()
            ->getJson('/api/v1/admin/users/assignable-roles?context=' . ProvisioningContext::DIRECT_CREATE)
            ->assertOk()->json('data.roles');

        $edit = $this->asRoot()
            ->getJson('/api/v1/admin/users/assignable-roles?context=' . ProvisioningContext::EDIT_USER)
            ->assertOk()->json('data.roles');

        $this->assertNotContains('employee', array_column($create, 'code'));
        $this->assertContains('employee', array_column($edit, 'code'));

        // Both lists still offer something, so an empty create list cannot be
        // mistaken for the rule working.
        $this->assertContains('hr_manager', array_column($create, 'code'));
    }

    public function test_filter_options_carries_both_lists(): void
    {
        $data = $this->asRoot()->getJson('/api/v1/admin/users/filter-options')->assertOk()->json('data');

        $this->assertNotContains(
            'employee',
            array_column($data['userTypeOptionsByContext'][ProvisioningContext::DIRECT_CREATE], 'code')
        );
        $this->assertContains(
            'employee',
            array_column($data['userTypeOptionsByContext'][ProvisioningContext::EDIT_USER], 'code')
        );
    }

    public function test_an_unknown_context_is_rejected_rather_than_defaulted(): void
    {
        $this->asRoot()
            ->getJson('/api/v1/admin/users/assignable-roles?context=trial')
            ->assertStatus(422);
    }

    // ── Server-side enforcement ──────────────────────────────────────────────

    public function test_direct_create_rejects_the_employee_role_id_from_a_manipulated_request(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Smuggled', 'email' => 'smuggled@prov.local', 'empCode' => 'P-5001',
            'password' => 'secret1234', 'roleId' => $this->roleId('employee'),
            'companyIds' => [$this->companyId('nidhi-impex')],
        ])->assertStatus(422)->assertJsonPath('error.code', 'ROLE_NOT_DIRECT_CREATABLE');

        $this->assertDatabaseMissing('users', ['emp_code' => 'P-5001']);
    }

    public function test_direct_create_rejects_the_employee_tier_when_no_role_id_is_sent(): void
    {
        // The legacy field is still accepted, so it must be held to the same
        // rule — otherwise the old payload shape is a way around the new one.
        $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Legacy Shape', 'email' => 'legacy@prov.local', 'empCode' => 'P-5002',
            'password' => 'secret1234', 'role' => 3, 'companyCode' => 'nidhi-impex',
        ])->assertStatus(422)->assertJsonPath('error.code', 'ROLE_NOT_DIRECT_CREATABLE');

        $this->assertDatabaseMissing('users', ['emp_code' => 'P-5002']);
    }

    public function test_a_tenant_admin_cannot_direct_create_a_sensitive_system_role(): void
    {
        $this->asTenantAdmin()->postJson('/api/v1/admin/users', [
            'name' => 'Escalation', 'email' => 'escalate@prov.local', 'empCode' => 'P-5003',
            'password' => 'secret1234', 'roleId' => $this->roleId('security_administrator'),
            'companyIds' => [$this->companyId('nidhi-impex')],
        ])->assertStatus(403);

        $this->assertDatabaseMissing('users', ['emp_code' => 'P-5003']);
    }

    public function test_a_tenant_admin_cannot_file_a_user_into_another_company(): void
    {
        $this->asTenantAdmin()->postJson('/api/v1/admin/users', [
            'name' => 'Cross Company', 'email' => 'cross@prov.local', 'empCode' => 'P-5004',
            'password' => 'secret1234', 'roleId' => $this->roleId('hr_manager'),
            'companyIds' => [$this->companyId('silver-star')],
        ])->assertStatus(403);

        $this->assertDatabaseMissing('users', ['emp_code' => 'P-5004']);
    }

    // ── Direct create, happy path ────────────────────────────────────────────

    public function test_direct_create_assigns_the_canonical_role_and_both_companies(): void
    {
        $id = $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Multi Company', 'email' => 'multi@prov.local', 'empCode' => 'P-6001',
            'password' => 'secret1234', 'roleId' => $this->roleId('tenant_administrator'),
            'companyIds' => [$this->companyId('silver-star'), $this->companyId('nidhi-impex')],
        ])->assertCreated()->json('data.id');

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $id, 'role_id' => $this->roleId('tenant_administrator'),
        ]);

        // Never the Employee role as a side effect. The tier for a role whose
        // code is not one of the canonical five falls back to Employee, and the
        // old derive-from-tier sync attached EMP because of it.
        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $id, 'role_id' => $this->roleId('employee'),
        ]);

        $this->assertSame(2, DB::table('user_companies')->where('user_id', $id)->count());

        // Deterministic and sorted: the same two companies always serialise the
        // same way, whatever order the boxes were ticked in.
        $this->assertSame(
            'nidhi-impex,silver-star',
            DB::table('users')->where('id', $id)->value('company_code')
        );
    }

    public function test_a_failed_company_sync_leaves_no_user_behind(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Rolled Back', 'email' => 'rollback@prov.local', 'empCode' => 'P-6002',
            'password' => 'secret1234', 'roleId' => $this->roleId('hr_manager'),
            'companyIds' => [999999],
        ])->assertStatus(403);

        $this->assertDatabaseMissing('users', ['emp_code' => 'P-6002']);
    }

    // ── Edit: promotion and demotion ─────────────────────────────────────────

    public function test_an_employee_can_be_promoted_to_admin(): void
    {
        $this->asRoot()->putJson('/api/v1/admin/users/' . $this->employee->id, [
            'roleId' => $this->roleId('tenant_administrator'),
            'businessReason' => 'Promoted to administrator.',
        ])->assertOk();

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $this->employee->id, 'role_id' => $this->roleId('tenant_administrator'),
        ]);

        // The identity is replaced, not accumulated.
        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $this->employee->id, 'role_id' => $this->roleId('employee'),
        ]);

        $this->employee->refresh();
        $this->assertSame(1, (int) $this->employee->role);
    }

    public function test_an_admin_can_be_demoted_back_to_employee(): void
    {
        $this->asRoot()->putJson('/api/v1/admin/users/' . $this->employee->id, [
            'roleId' => $this->roleId('tenant_administrator'),
        ])->assertOk();

        $this->asRoot()->putJson('/api/v1/admin/users/' . $this->employee->id, [
            'roleId' => $this->roleId('employee'),
        ])->assertOk();

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $this->employee->id, 'role_id' => $this->roleId('employee'),
        ]);
        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $this->employee->id, 'role_id' => $this->roleId('tenant_administrator'),
        ]);
    }

    public function test_a_role_change_does_not_disturb_company_membership(): void
    {
        $this->asRoot()->putJson('/api/v1/admin/users/' . $this->employee->id, [
            'companyIds' => [$this->companyId('nidhi-impex'), $this->companyId('silver-star')],
        ])->assertOk();

        $this->asRoot()->putJson('/api/v1/admin/users/' . $this->employee->id, [
            'roleId' => $this->roleId('tenant_administrator'),
        ])->assertOk();

        $this->assertSame(2, DB::table('user_companies')->where('user_id', $this->employee->id)->count());
        $this->assertSame(
            'nidhi-impex,silver-star',
            DB::table('users')->where('id', $this->employee->id)->value('company_code')
        );
    }

    public function test_a_role_change_bumps_the_authorization_cache_version(): void
    {
        $cache = app(\App\Services\Authorization\AuthorizationCache::class);
        $before = $cache->version('nidhi-impex');

        $this->asRoot()->putJson('/api/v1/admin/users/' . $this->employee->id, [
            'roleId' => $this->roleId('hr_manager'),
        ])->assertOk();

        $this->assertGreaterThan($before, $cache->version('nidhi-impex'));
    }

    public function test_a_tenant_admin_cannot_promote_a_user_to_a_sensitive_role_by_editing(): void
    {
        // The edit form writes roles now, so it is guarded like /assign-role.
        // It previously wrote users.role and derived the assignment from it,
        // which reached the same outcome with neither guard applied.
        $this->asTenantAdmin()->putJson('/api/v1/admin/users/' . $this->employee->id, [
            'roleId' => $this->roleId('security_administrator'),
        ])->assertStatus(403);

        $this->assertDatabaseMissing('user_roles', [
            'user_id' => $this->employee->id, 'role_id' => $this->roleId('security_administrator'),
        ]);
    }

    public function test_edit_options_still_show_a_role_the_actor_may_not_assign(): void
    {
        $this->grant($this->employee, 'security_administrator');

        $options = $this->asTenantAdmin()
            ->getJson('/api/v1/admin/users/assignable-roles?context=' . ProvisioningContext::EDIT_USER
                . '&userId=' . $this->employee->id)
            ->assertOk()->json('data.roles');

        $sensitive = collect($options)->firstWhere('code', 'security_administrator');

        $this->assertNotNull($sensitive, 'The current role must be visible so the dropdown shows the truth.');
        $this->assertFalse($sensitive['selectable'], 'Visible is not the same as assignable.');
    }

    // ── Trial and appointment ────────────────────────────────────────────────

    public function test_a_trial_form_submission_receives_the_canonical_employee_role(): void
    {
        $this->asTenantAdmin()->postJson('/api/trial-form/store', [
            'name' => 'Trial Candidate', 'company_code' => 'nidhi-impex', 'unit' => 'Shreeji',
            // A role id in the body must change nothing: this flow resolves the
            // role itself.
            'role' => 1,
        ])->assertOk();

        $trial = User::query()->where('name', 'Trial Candidate')->firstOrFail();

        $this->assertSame(3, (int) $trial->role);
        $this->assertSame('trial', $trial->type);
        $this->assertDatabaseHas('user_roles', [
            'user_id' => $trial->id, 'role_id' => $this->roleId('employee'),
        ]);
        $this->assertSame(1, DB::table('user_companies')->where('user_id', $trial->id)->count());
    }

    public function test_an_appointment_receives_the_canonical_employee_role_and_carries_its_company(): void
    {
        $id = $this->asTenantAdmin()->postJson('/api/v1/appointments', [
            'name' => 'Appointed Person', 'company_code' => 'nidhi-impex', 'unit' => 'Shreeji',
        ])->assertCreated()->json('data.appointmentId');

        $this->assertDatabaseHas('user_roles', [
            'user_id' => $id, 'role_id' => $this->roleId('employee'),
        ]);

        $appointment = User::query()->findOrFail($id);
        $this->assertSame('appointment', $appointment->type);
        $this->assertSame('nidhi-impex', $appointment->company_code);
        $this->assertSame(1, DB::table('user_companies')->where('user_id', $id)->count());
    }

    // ── Units ────────────────────────────────────────────────────────────────

    private function unitId(string $companyCode, string $name): int
    {
        return (int) DB::table('units')
            ->where('company_id', $this->companyId($companyCode))
            ->where('name', $name)
            ->value('id');
    }

    public function test_a_unit_belonging_to_an_unselected_company_is_rejected(): void
    {
        // The browser filters the list; this is the rule. A request naming a
        // Silver Star unit alongside only Nidhi Impex must not be accepted just
        // because the dropdown would never have offered it.
        $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Wrong Unit', 'email' => 'wrongunit@prov.local', 'empCode' => 'P-7001',
            'password' => 'secret1234', 'roleId' => $this->roleId('hr_manager'),
            'companyIds' => [$this->companyId('nidhi-impex')],
            'unitIds' => [$this->unitId('silver-star', 'Daduk')],
        ])->assertStatus(422)->assertJsonPath('error.code', 'UNIT_OUTSIDE_COMPANY');

        $this->assertDatabaseMissing('users', ['emp_code' => 'P-7001']);
    }

    public function test_a_single_unit_is_its_own_primary(): void
    {
        $id = $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'One Unit', 'email' => 'oneunit@prov.local', 'empCode' => 'P-7005',
            'password' => 'secret1234', 'roleId' => $this->roleId('hr_manager'),
            'companyIds' => [$this->companyId('nidhi-impex')],
            'unitIds' => [$this->unitId('nidhi-impex', 'Shreeji')],
        ])->assertCreated()->json('data.id');

        // Asking would be a question with one possible answer.
        $this->assertSame('Shreeji', DB::table('users')->where('id', $id)->value('unit'));
    }

    public function test_several_units_require_the_primary_to_be_named(): void
    {
        /*
         * users.unit is the home unit — what attendance, payroll, imports and
         * every unit filter read. It was briefly the alphabetically first
         * selection, which let the alphabet decide real employment data.
         */
        $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'No Primary', 'email' => 'noprimary@prov.local', 'empCode' => 'P-7006',
            'password' => 'secret1234', 'roleId' => $this->roleId('hr_manager'),
            'companyIds' => [$this->companyId('nidhi-impex')],
            'unitIds' => [
                $this->unitId('nidhi-impex', 'Shreeji'),
                $this->unitId('nidhi-impex', 'Ichapur'),
            ],
        ])->assertStatus(422)->assertJsonPath('error.code', 'PRIMARY_UNIT_REQUIRED');

        $this->assertDatabaseMissing('users', ['emp_code' => 'P-7006']);
    }

    public function test_units_are_stored_in_the_pivot_with_the_named_primary_mirrored(): void
    {
        $id = $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Two Units', 'email' => 'twounits@prov.local', 'empCode' => 'P-7002',
            'password' => 'secret1234', 'roleId' => $this->roleId('hr_manager'),
            'companyIds' => [$this->companyId('nidhi-impex')],
            'unitIds' => [
                $this->unitId('nidhi-impex', 'Shreeji'),
                $this->unitId('nidhi-impex', 'Ichapur'),
            ],
            // Deliberately the alphabetically LAST, so a passing test cannot be
            // the old derivation in disguise.
            'primaryUnitId' => $this->unitId('nidhi-impex', 'Shreeji'),
        ])->assertCreated()->json('data.id');

        $this->assertSame(2, DB::table('user_units')->where('user_id', $id)->count());
        $this->assertSame('Shreeji', DB::table('users')->where('id', $id)->value('unit'));
    }

    public function test_a_primary_that_is_not_among_the_selected_units_is_rejected(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Bad Primary', 'email' => 'badprimary@prov.local', 'empCode' => 'P-7007',
            'password' => 'secret1234', 'roleId' => $this->roleId('hr_manager'),
            'companyIds' => [$this->companyId('nidhi-impex')],
            'unitIds' => [$this->unitId('nidhi-impex', 'Shreeji')],
            'primaryUnitId' => $this->unitId('nidhi-impex', 'Ichapur'),
        ])->assertStatus(422)->assertJsonPath('error.code', 'PRIMARY_UNIT_NOT_SELECTED');
    }

    public function test_the_edit_form_can_read_back_which_unit_is_primary(): void
    {
        $id = $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Readback', 'email' => 'readback@prov.local', 'empCode' => 'P-7008',
            'password' => 'secret1234', 'roleId' => $this->roleId('hr_manager'),
            'companyIds' => [$this->companyId('nidhi-impex')],
            'unitIds' => [
                $this->unitId('nidhi-impex', 'Shreeji'),
                $this->unitId('nidhi-impex', 'Ichapur'),
            ],
            'primaryUnitId' => $this->unitId('nidhi-impex', 'Ichapur'),
        ])->assertCreated()->json('data.id');

        $this->assertSame(
            $this->unitId('nidhi-impex', 'Ichapur'),
            $this->asRoot()->getJson('/api/v1/admin/users/' . $id)->assertOk()->json('data.primaryUnitId'),
        );
    }

    public function test_removing_a_company_removes_its_units(): void
    {
        $id = $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Both Companies', 'email' => 'both@prov.local', 'empCode' => 'P-7003',
            'password' => 'secret1234', 'roleId' => $this->roleId('hr_manager'),
            'companyIds' => [$this->companyId('nidhi-impex'), $this->companyId('silver-star')],
            'unitIds' => [
                $this->unitId('nidhi-impex', 'Shreeji'),
                $this->unitId('silver-star', 'Daduk'),
            ],
            // The primary is in the company that is about to be removed.
            'primaryUnitId' => $this->unitId('silver-star', 'Daduk'),
        ])->assertCreated()->json('data.id');

        $this->assertSame(2, DB::table('user_units')->where('user_id', $id)->count());
        $this->assertSame('Daduk', DB::table('users')->where('id', $id)->value('unit'));

        // Companies change, units are not mentioned. The stale one must go
        // anyway: the browser clearing its checkbox is cosmetic.
        $this->asRoot()->putJson('/api/v1/admin/users/' . $id, [
            'companyIds' => [$this->companyId('nidhi-impex')],
        ])->assertOk();

        $remaining = DB::table('user_units')->where('user_id', $id)->pluck('unit_id')->all();

        $this->assertSame([$this->unitId('nidhi-impex', 'Shreeji')], array_map('intval', $remaining));

        // The home unit followed rather than being left pointing at a unit the
        // account no longer belongs to.
        $this->assertSame('Shreeji', DB::table('users')->where('id', $id)->value('unit'));
    }

    public function test_a_unit_kept_while_its_company_is_dropped_in_the_same_request_is_rejected(): void
    {
        $id = $this->asRoot()->postJson('/api/v1/admin/users', [
            'name' => 'Same Request', 'email' => 'samereq@prov.local', 'empCode' => 'P-7004',
            'password' => 'secret1234', 'roleId' => $this->roleId('hr_manager'),
            'companyIds' => [$this->companyId('nidhi-impex'), $this->companyId('silver-star')],
            'unitIds' => [$this->unitId('silver-star', 'Daduk')],
        ])->assertCreated()->json('data.id');

        $this->asRoot()->putJson('/api/v1/admin/users/' . $id, [
            'companyIds' => [$this->companyId('nidhi-impex')],
            'unitIds' => [$this->unitId('silver-star', 'Daduk')],
        ])->assertStatus(422)->assertJsonPath('error.code', 'UNIT_OUTSIDE_COMPANY');
    }

    public function test_existing_users_are_not_backfilled_into_the_unit_pivot(): void
    {
        // Ownership of the legacy unit names is unconfirmed, so normalisation
        // stops at the definitions. An employee whose unit string predates this
        // keeps it and gains no membership.
        $this->employee->unit = 'Daduk';
        $this->employee->save();

        $this->assertSame(0, DB::table('user_units')->where('user_id', $this->employee->id)->count());
        $this->assertSame('Daduk', $this->employee->fresh()->unit);
    }

    public function test_provisioning_records_which_flow_created_the_account(): void
    {
        $this->asTenantAdmin()->postJson('/api/trial-form/store', [
            'name' => 'Sourced Candidate', 'company_code' => 'nidhi-impex',
        ])->assertOk();

        $this->assertSame(
            ProvisioningContext::TRIAL,
            User::query()->where('name', 'Sourced Candidate')->value('provisioning_source')
        );
    }
}
