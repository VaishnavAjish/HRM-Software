<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Role;
use App\Models\Unit;
use App\Models\User;
use App\Services\Authorization\FeatureFlags;
use Database\Seeders\AdminUserManagementPermissionSeeder;
use Database\Seeders\CompanyUnitPermissionSeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Company and unit master data, and the guards that stop it taking users with it.
 *
 * The delete and code-lock rules carry the weight here. A company code is the
 * value users.company_code holds and every scope check partitions on, so both a
 * rename and a delete reach accounts that are nowhere near this screen.
 */
class CompanyUnitManagementTest extends TestCase
{
    use RefreshDatabase;

    private User $superAdmin;

    private User $tenantAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RbacSeeder::class);
        $this->seed(AdminUserManagementPermissionSeeder::class);
        // Roles are created by the seeder above, after the migration that would
        // otherwise have granted these — so the grants are applied here.
        $this->seed(CompanyUnitPermissionSeeder::class);

        DB::table('authorization_feature_flags')->updateOrInsert(
            ['tenant_id' => '*', 'key' => 'authorization_shadow_mode'],
            ['enabled' => false, 'created_at' => now(), 'updated_at' => now()]
        );
        app(FeatureFlags::class)->forget('authorization_shadow_mode', null);

        foreach (['nidhi-impex', 'silver-star'] as $tenant) {
            app(FeatureFlags::class)->forget('authorization_shadow_mode', $tenant);
        }

        $this->superAdmin = User::create([
            'name' => 'Root', 'email' => 'root@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->tenantAdmin = User::create([
            'name' => 'Tenant Admin', 'email' => 'tenant@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-TEN', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->superAdmin->roles()->syncWithoutDetaching([$this->roleId('super_administrator')]);
        $this->tenantAdmin->roles()->syncWithoutDetaching([$this->roleId('tenant_administrator')]);

        /*
         * The migration seeds four unit definitions as production bootstrap
         * data. These tests assert the management rules — uniqueness, delete
         * protection, legacy adoption — and each needs to know exactly what
         * exists, so they start from none rather than reasoning around defaults.
         */
        DB::table('user_units')->delete();
        DB::table('units')->delete();
    }

    private function roleId(string $code): int
    {
        return (int) Role::query()->where('code', $code)->firstOrFail()->id;
    }

    private function asRoot(): static
    {
        return $this->withToken(auth('api')->login($this->superAdmin));
    }

    private function asTenantAdmin(): static
    {
        return $this->withToken(auth('api')->login($this->tenantAdmin));
    }

    /**
     * The two production companies are seeded by migration, so this adopts an
     * existing row rather than colliding with it. Their absence was itself a
     * bug: a fresh database had no companies, and the New User form requires
     * one, so account creation was impossible until somebody noticed.
     */
    private function makeCompany(string $name, string $code): Company
    {
        $company = Company::query()->firstOrCreate(
            ['code' => $code],
            ['name' => $name, 'is_active' => true],
        );

        if (! $company->is_active) {
            $company->update(['is_active' => true]);
        }

        return $company;
    }

    /* ------------------------------------------------------------ companies */

    public function test_a_company_can_be_created_and_appears_in_the_list(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/companies', [
            'name' => 'Test Company', 'code' => 'test-company',
        ])->assertCreated()->assertJsonPath('data.code', 'test-company');

        $this->assertDatabaseHas('companies', ['code' => 'test-company', 'is_active' => true]);
    }

    public function test_a_new_company_is_immediately_offered_to_the_new_user_form(): void
    {
        // The point of the master data: no frontend change, no seeder, no
        // deployment — creating it here makes it selectable there.
        $this->asRoot()->postJson('/api/v1/admin/companies', [
            'name' => 'Third Company', 'code' => 'third-company',
        ])->assertCreated();

        $codes = array_column(
            $this->asRoot()->getJson('/api/v1/admin/users/filter-options')->assertOk()->json('data.companies'),
            'code'
        );

        $this->assertContains('third-company', $codes);
    }

    public function test_a_duplicate_company_code_is_rejected(): void
    {
        $this->makeCompany('Silver Star', 'silver-star');

        $this->asRoot()->postJson('/api/v1/admin/companies', [
            'name' => 'Silver Star Again', 'code' => 'silver-star',
        ])->assertStatus(422)->assertJsonValidationErrors('code');

        $this->assertSame(1, Company::query()->where('code', 'silver-star')->count());
    }

    public function test_a_company_code_containing_a_comma_is_rejected(): void
    {
        // The comma is the legacy list separator. A code containing one would
        // parse as two companies and scope an account to something that does
        // not exist.
        $this->asRoot()->postJson('/api/v1/admin/companies', [
            'name' => 'Both', 'code' => 'nidhi-impex,silver-star',
        ])->assertStatus(422)->assertJsonPath('error.code', 'INVALID_COMPANY_CODE');

        $this->assertDatabaseMissing('companies', ['name' => 'Both']);
    }

    public function test_a_company_code_is_locked_once_a_user_depends_on_it(): void
    {
        $company = $this->makeCompany('Silver Star', 'silver-star');

        User::create([
            'name' => 'Scoped', 'email' => 'scoped@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-1', 'role' => 3, 'company_code' => 'silver-star', 'status' => 0,
        ]);

        $this->asRoot()->putJson('/api/v1/admin/companies/' . $company->id, [
            'code' => 'silverstar',
        ])->assertStatus(422)->assertJsonPath('error.code', 'COMPANY_CODE_LOCKED');

        $this->assertSame('silver-star', $company->fresh()->code);
    }

    public function test_a_company_can_still_be_renamed_while_its_code_is_locked(): void
    {
        $company = $this->makeCompany('Silver Star', 'silver-star');

        User::create([
            'name' => 'Scoped', 'email' => 'scoped2@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-2', 'role' => 3, 'company_code' => 'silver-star', 'status' => 0,
        ]);

        $this->asRoot()->putJson('/api/v1/admin/companies/' . $company->id, [
            'name' => 'Silver Star Diam Pvt Ltd',
        ])->assertOk();

        $company->refresh();
        $this->assertSame('Silver Star Diam Pvt Ltd', $company->name);
        $this->assertSame('silver-star', $company->code);
    }

    public function test_a_company_with_users_cannot_be_deleted_even_by_direct_request(): void
    {
        $company = $this->makeCompany('Silver Star', 'silver-star');

        User::create([
            'name' => 'Scoped', 'email' => 'scoped3@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-3', 'role' => 3, 'company_code' => 'silver-star', 'status' => 0,
        ]);

        $this->asRoot()->deleteJson('/api/v1/admin/companies/' . $company->id)
            ->assertStatus(422)->assertJsonPath('error.code', 'COMPANY_IN_USE');

        $this->assertDatabaseHas('companies', ['id' => $company->id]);
        $this->assertDatabaseHas('users', ['emp_code' => 'CU-3']);
    }

    public function test_a_company_with_units_cannot_be_deleted(): void
    {
        $company = $this->makeCompany('Empty Co', 'empty-co');
        Unit::query()->create(['company_id' => $company->id, 'name' => 'Only Unit', 'code' => 'only-unit', 'is_active' => true]);

        $this->asRoot()->deleteJson('/api/v1/admin/companies/' . $company->id)
            ->assertStatus(422)->assertJsonPath('error.code', 'COMPANY_IN_USE');
    }

    public function test_an_unused_company_can_be_deleted(): void
    {
        $company = $this->makeCompany('Disposable', 'disposable');

        $this->asRoot()->deleteJson('/api/v1/admin/companies/' . $company->id)->assertOk();

        $this->assertDatabaseMissing('companies', ['id' => $company->id]);
    }

    public function test_a_deactivated_company_stays_in_management_but_leaves_the_user_form(): void
    {
        $company = $this->makeCompany('Retired Co', 'retired-co');

        $this->asRoot()->patchJson('/api/v1/admin/companies/' . $company->id . '/status', [
            'isActive' => false,
        ])->assertOk()->assertJsonPath('data.isActive', false);

        $managed = array_column(
            $this->asRoot()->getJson('/api/v1/admin/companies')->assertOk()->json('data'),
            'code'
        );
        $assignable = array_column(
            $this->asRoot()->getJson('/api/v1/admin/users/filter-options')->assertOk()->json('data.companies'),
            'code'
        );

        $this->assertContains('retired-co', $managed, 'History must survive deactivation.');
        $this->assertNotContains('retired-co', $assignable, 'An inactive company must not be assignable.');
    }

    /* ---------------------------------------------------------------- units */

    public function test_a_unit_is_created_under_its_company_and_filtered_by_it(): void
    {
        $nidhi = $this->makeCompany('Nidhi Impex', 'nidhi-impex');
        $silver = $this->makeCompany('Silver Star', 'silver-star');

        $this->asRoot()->postJson('/api/v1/admin/units', [
            'companyId' => $silver->id, 'name' => 'Test Unit',
        ])->assertCreated()->assertJsonPath('data.companyName', 'Silver Star');

        $forSilver = array_column(
            $this->asRoot()->getJson('/api/v1/admin/units?company_ids[]=' . $silver->id)->assertOk()->json('data'),
            'name'
        );
        $forNidhi = array_column(
            $this->asRoot()->getJson('/api/v1/admin/units?company_ids[]=' . $nidhi->id)->assertOk()->json('data'),
            'name'
        );

        $this->assertContains('Test Unit', $forSilver);
        $this->assertNotContains('Test Unit', $forNidhi);
    }

    public function test_two_companies_may_each_own_a_unit_of_the_same_name(): void
    {
        // "Ichapur" is a real place inside both companies. A global unique key
        // would force one of them to be called something nobody uses.
        $nidhi = $this->makeCompany('Nidhi Impex', 'nidhi-impex');
        $silver = $this->makeCompany('Silver Star', 'silver-star');

        $this->asRoot()->postJson('/api/v1/admin/units', ['companyId' => $nidhi->id, 'name' => 'Ichapur'])->assertCreated();
        $this->asRoot()->postJson('/api/v1/admin/units', ['companyId' => $silver->id, 'name' => 'Ichapur'])->assertCreated();

        $this->assertSame(2, Unit::query()->where('name', 'Ichapur')->count());
    }

    public function test_a_duplicate_unit_name_within_one_company_is_rejected(): void
    {
        $company = $this->makeCompany('Nidhi Impex', 'nidhi-impex');

        $this->asRoot()->postJson('/api/v1/admin/units', ['companyId' => $company->id, 'name' => 'Shreeji'])->assertCreated();
        $this->asRoot()->postJson('/api/v1/admin/units', ['companyId' => $company->id, 'name' => 'Shreeji'])
            ->assertStatus(422)->assertJsonPath('error.code', 'UNIT_NAME_TAKEN');
    }

    public function test_a_unit_cannot_be_added_to_an_inactive_company(): void
    {
        $company = $this->makeCompany('Retired Co', 'retired-co');
        $company->update(['is_active' => false]);

        $this->asRoot()->postJson('/api/v1/admin/units', ['companyId' => $company->id, 'name' => 'Late Unit'])
            ->assertStatus(422)->assertJsonPath('error.code', 'COMPANY_INACTIVE');
    }

    public function test_a_unit_with_users_cannot_be_deleted_or_reparented(): void
    {
        $silver = $this->makeCompany('Silver Star', 'silver-star');
        $nidhi = $this->makeCompany('Nidhi Impex', 'nidhi-impex');

        $unit = Unit::query()->create([
            'company_id' => $silver->id, 'name' => 'Daduk', 'code' => 'daduk', 'is_active' => true,
        ]);

        $worker = User::create([
            'name' => 'Worker', 'email' => 'worker@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-4', 'role' => 3, 'company_code' => 'silver-star',
            'unit' => 'Daduk', 'status' => 0,
        ]);

        DB::table('user_units')->insert([
            'user_id' => $worker->id, 'unit_id' => $unit->id,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->asRoot()->deleteJson('/api/v1/admin/units/' . $unit->id)
            ->assertStatus(422)->assertJsonPath('error.code', 'UNIT_IN_USE');

        $this->asRoot()->putJson('/api/v1/admin/units/' . $unit->id, ['companyId' => $nidhi->id])
            ->assertStatus(422)->assertJsonPath('error.code', 'UNIT_COMPANY_LOCKED');

        $this->assertDatabaseHas('units', ['id' => $unit->id, 'company_id' => $silver->id]);
        $this->assertDatabaseHas('users', ['emp_code' => 'CU-4']);
    }

    public function test_a_unit_held_only_by_the_legacy_column_still_blocks_deletion(): void
    {
        // No pivot row exists — the backfill has not run — but 333 people carry
        // this string and the scope queries read it. Deleting would be a
        // silent data loss dressed up as tidying.
        $silver = $this->makeCompany('Silver Star', 'silver-star');
        $unit = Unit::query()->create([
            'company_id' => $silver->id, 'name' => 'Daduk', 'code' => 'daduk', 'is_active' => true,
        ]);

        User::create([
            'name' => 'Legacy Worker', 'email' => 'legacy@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-5', 'role' => 3, 'company_code' => 'silver-star',
            'unit' => 'Daduk', 'status' => 0,
        ]);

        $this->assertSame(0, DB::table('user_units')->where('unit_id', $unit->id)->count());

        $this->asRoot()->deleteJson('/api/v1/admin/units/' . $unit->id)
            ->assertStatus(422)->assertJsonPath('error.code', 'UNIT_IN_USE');
    }

    public function test_a_deactivated_unit_leaves_the_user_form_but_keeps_its_record(): void
    {
        $company = $this->makeCompany('Nidhi Impex', 'nidhi-impex');
        $unit = Unit::query()->create([
            'company_id' => $company->id, 'name' => 'Old Wing', 'code' => 'old-wing', 'is_active' => true,
        ]);

        $this->asRoot()->patchJson('/api/v1/admin/units/' . $unit->id . '/status', ['isActive' => false])->assertOk();

        $offered = array_column(
            $this->asRoot()->getJson('/api/v1/admin/users/filter-options')->assertOk()->json('data.unitOptions'),
            'name'
        );

        $this->assertNotContains('Old Wing', $offered);
        $this->assertDatabaseHas('units', ['id' => $unit->id, 'is_active' => false]);
    }

    /* ------------------------------------------------------- legacy mapping */

    public function test_legacy_units_are_reported_without_a_company_being_guessed(): void
    {
        $this->makeCompany('Silver Star', 'silver-star');

        User::create([
            'name' => 'Legacy One', 'email' => 'l1@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-6', 'role' => 3, 'company_code' => 'silver-star', 'unit' => 'Daduk', 'status' => 0,
        ]);

        $rows = $this->asRoot()->getJson('/api/v1/admin/units/legacy')->assertOk()->json('data');
        $daduk = collect($rows)->firstWhere('name', 'Daduk');

        $this->assertNotNull($daduk);
        $this->assertSame('silver-star', $daduk['companyCode']);
        $this->assertSame(1, $daduk['users']);

        // Reported, never created. No unit record exists until somebody says so.
        $this->assertSame(0, Unit::query()->where('name', 'Daduk')->count());
    }

    public function test_adopting_a_legacy_unit_creates_the_record_and_links_matching_users(): void
    {
        $silver = $this->makeCompany('Silver Star', 'silver-star');
        $nidhi = $this->makeCompany('Nidhi Impex', 'nidhi-impex');

        $mine = User::create([
            'name' => 'Silver Worker', 'email' => 'sw@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-7', 'role' => 3, 'company_code' => 'silver-star', 'unit' => 'Daduk', 'status' => 0,
        ]);

        // Same unit string, different company. Must not be swept up.
        $theirs = User::create([
            'name' => 'Nidhi Worker', 'email' => 'nw@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-8', 'role' => 3, 'company_code' => 'nidhi-impex', 'unit' => 'Daduk', 'status' => 0,
        ]);

        $this->asRoot()->postJson('/api/v1/admin/units/legacy/adopt', [
            'name' => 'Daduk', 'companyId' => $silver->id,
        ])->assertOk()->assertJsonPath('data.linked', 1);

        $unit = Unit::query()->where('company_id', $silver->id)->where('name', 'Daduk')->firstOrFail();

        $this->assertDatabaseHas('user_units', ['user_id' => $mine->id, 'unit_id' => $unit->id]);
        $this->assertDatabaseMissing('user_units', ['user_id' => $theirs->id, 'unit_id' => $unit->id]);

        // The legacy string is untouched: it is what the scope queries read, and
        // rewriting it here would change access as a side effect.
        $this->assertSame('Daduk', $mine->fresh()->unit);
        $this->assertSame(0, Unit::query()->where('company_id', $nidhi->id)->count());
    }

    /* ----------------------------------------------------------- permission */

    public function test_a_tenant_admin_may_read_the_master_data_but_not_change_it(): void
    {
        // Read is granted because the New User form needs the lists at all.
        // Writing is not: the code is the tenant key.
        $company = $this->makeCompany('Nidhi Impex', 'nidhi-impex');

        $this->asTenantAdmin()->getJson('/api/v1/admin/companies')->assertOk();

        $this->asTenantAdmin()->postJson('/api/v1/admin/companies', [
            'name' => 'Sneaky', 'code' => 'sneaky',
        ])->assertStatus(403);

        $this->asTenantAdmin()->putJson('/api/v1/admin/companies/' . $company->id, [
            'name' => 'Renamed',
        ])->assertStatus(403);

        $this->asTenantAdmin()->deleteJson('/api/v1/admin/companies/' . $company->id)->assertStatus(403);

        $this->assertDatabaseMissing('companies', ['code' => 'sneaky']);
        $this->assertSame('Nidhi Impex', $company->fresh()->name);
    }

    /* ------------------------------------ lookup vs management, deliberately */

    public function test_the_assignable_lookup_is_scoped_and_needs_no_management_permission(): void
    {
        /*
         * Populating a dropdown and administering tenant configuration are
         * different capabilities. An agent filling in a trial form must not
         * need the permission that also opens Company & Unit Management, where
         * codes are renamed and companies deleted — so the lookup is authorised
         * by its own scoping instead.
         */
        $this->makeCompany('Nidhi Impex', 'nidhi-impex');
        $this->makeCompany('Silver Star', 'silver-star');

        $agent = User::create([
            'name' => 'Agent', 'email' => 'agent@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-AGENT', 'role' => 4, 'type' => 'agent',
            'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $codes = array_column(
            $this->withToken(auth('api')->login($agent))
                ->getJson('/api/v1/provisioning/company-options')
                ->assertOk()->json('data.companies'),
            'code'
        );

        $this->assertSame(['nidhi-impex'], $codes, 'The lookup must not reach beyond the actor.');

        // And it is genuinely not the management surface.
        $this->withToken(auth('api')->login($agent))
            ->getJson('/api/v1/admin/companies')->assertStatus(403);
    }

    public function test_an_actor_with_no_companies_is_offered_none(): void
    {
        // Fail closed: the scope filter used to be skipped when the actor
        // resolved to no companies, which offered them every tenant.
        $this->makeCompany('Nidhi Impex', 'nidhi-impex');

        $stranded = User::create([
            'name' => 'Stranded', 'email' => 'stranded@cu.local', 'password' => 'secret1234',
            'emp_code' => 'CU-NONE', 'role' => 1, 'company_code' => 'all-companies', 'status' => 0,
        ]);

        $this->assertSame(
            [],
            $this->withToken(auth('api')->login($stranded))
                ->getJson('/api/v1/provisioning/company-options')
                ->assertOk()->json('data.companies'),
        );
    }

    public function test_an_inactive_company_and_its_units_are_not_offered_for_assignment(): void
    {
        $company = $this->makeCompany('Retired Co', 'retired-co');
        Unit::query()->create([
            'company_id' => $company->id, 'name' => 'Retired Unit',
            'code' => 'retired-unit', 'is_active' => true,
        ]);

        $this->asRoot()->patchJson('/api/v1/admin/companies/' . $company->id . '/status', [
            'isActive' => false,
        ])->assertOk();

        $data = $this->asRoot()->getJson('/api/v1/provisioning/company-options')->assertOk()->json('data');

        $this->assertNotContains('retired-co', array_column($data['companies'], 'code'));
        $this->assertNotContains('Retired Unit', array_column($data['units'], 'name'));
    }

    public function test_company_changes_are_audited(): void
    {
        $this->asRoot()->postJson('/api/v1/admin/companies', [
            'name' => 'Audited Co', 'code' => 'audited-co',
        ])->assertCreated();

        $this->assertDatabaseHas('authorization_permission_audit_logs', [
            'subject_type' => 'COMPANY', 'change_type' => 'COMPANY_CREATED',
        ]);
    }
}
