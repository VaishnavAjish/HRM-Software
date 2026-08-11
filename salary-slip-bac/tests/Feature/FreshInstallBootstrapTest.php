<?php

namespace Tests\Feature;

use App\Services\Provisioning\CompanyMembershipService;
use App\Services\Provisioning\RoleResolver;
use App\Support\ProvisioningContext;
use Database\Seeders\CompanyUnitPermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * Migrations alone must produce a usable system.
 *
 * ProductionSafetyServiceProvider blocks `db:seed` outright, so every record the
 * application needs at runtime has to arrive through a migration. Nothing
 * enforced that, and it had already failed twice:
 *
 *   - `companies` was created but never populated, and the New User form
 *     requires a company — so on any deployment but the one where the rows were
 *     inserted by hand, no account could be created at all.
 *
 *   - `units` was populated by a seeder that probed the schema through
 *     SchemaSupport::hasTable, which memoises per process. Called from the
 *     migration that had just created the table, it read a cached "missing" and
 *     silently did nothing.
 *
 * RefreshDatabase runs exactly the migrations, so this class is that guarantee.
 * It deliberately seeds nothing itself.
 */
class FreshInstallBootstrapTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_schema_exists(): void
    {
        foreach (['companies', 'units', 'user_companies', 'user_units'] as $table) {
            $this->assertTrue(Schema::hasTable($table), "{$table} is missing after migrating.");
        }

        $this->assertTrue(Schema::hasColumn('roles', 'is_direct_creatable'));
        $this->assertTrue(Schema::hasColumn('users', 'provisioning_source'));
    }

    public function test_companies_are_populated_without_a_seeder(): void
    {
        $codes = DB::table('companies')->orderBy('code')->pluck('code')->all();

        $this->assertSame(['nidhi-impex', 'silver-star'], $codes);
        $this->assertSame(2, DB::table('companies')->where('is_active', true)->count());
    }

    public function test_unit_definitions_are_populated_without_a_seeder(): void
    {
        // The memoised-probe bug produced exactly zero rows here.
        $units = DB::table('units')
            ->join('companies', 'companies.id', '=', 'units.company_id')
            ->orderBy('companies.code')->orderBy('units.name')
            ->get(['companies.code as company', 'units.name as unit'])
            // Concatenated in PHP rather than SQL: `||` is Postgres/SQLite and
            // this assertion has to hold on whichever engine a deployment uses.
            ->map(static fn ($row) => $row->company . '/' . $row->unit)
            ->all();

        $this->assertSame([
            'nidhi-impex/Ichapur',
            'nidhi-impex/Shreeji',
            'silver-star/Daduk',
            'silver-star/Ichapur',
        ], $units);
    }

    public function test_no_user_is_backfilled_into_the_pivots(): void
    {
        // Definitions, not assignments. Unit ownership of the legacy strings is
        // unconfirmed, so a fresh install must claim nothing about who is where.
        $this->assertSame(0, DB::table('user_units')->count());
    }

    public function test_the_company_and_unit_permissions_exist(): void
    {
        $codes = DB::table('permissions')
            ->whereIn('code', CompanyUnitPermissionSeeder::CODES)
            ->pluck('code')->all();

        $this->assertCount(count(CompanyUnitPermissionSeeder::CODES), $codes);
    }

    public function test_the_employee_role_is_never_direct_creatable_on_a_fresh_database(): void
    {
        /*
         * The migration can only stamp rows that exist when it runs, and the
         * roles are seeded afterwards — so on a fresh database the flag takes
         * its permissive default. The resolver excludes the canonical employee
         * codes by code for exactly that reason, and this asserts it end to end.
         */
        $this->seed(\Database\Seeders\RbacSeeder::class);

        $resolver = app(RoleResolver::class);
        $employee = $resolver->employeeRole();

        $this->assertNotNull($employee, 'A deployment with no employee role cannot provision employees.');
        $this->assertFalse($resolver->isDirectCreatable($employee));

        $this->assertNotContains(
            'employee',
            array_column($resolver->options(null, ProvisioningContext::DIRECT_CREATE), 'code'),
        );
    }

    public function test_the_new_user_form_can_offer_a_company_immediately(): void
    {
        // The end the earlier failures were felt at: without companies, the
        // form's required field has no options and nothing can be created.
        $this->seed(\Database\Seeders\RbacSeeder::class);

        $root = \App\Models\User::create([
            'name' => 'Root', 'email' => 'root@fresh.local', 'password' => 'secret1234',
            'emp_code' => 'F-ROOT', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $this->assertNotEmpty(app(CompanyMembershipService::class)->optionsFor($root));
    }
}
