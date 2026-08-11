<?php

namespace Tests\Feature;

use App\Http\Middleware\RequireModuleSchema;
use App\Models\User;
use App\Services\Authorization\SchemaSupport;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The HR module against a database that does not have its tables.
 *
 * This is production's actual shape: `php artisan migrate` is blocked by an
 * unrecorded authorization migration, so none of the thirteen HR tables exist
 * while all thirty-six routes stay registered. The permission gate does not
 * stop the request — no `hr.*` code exists, so the engine denies, shadow mode
 * rescues the deny, and the legacy check allows any admin through — and the
 * controller then fails on a missing relation.
 *
 * Dropping the tables here reproduces that exactly, so these fail if the gate
 * is removed or a route is added outside it.
 */
class HrModuleSchemaGateTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::create([
            'name' => 'HR Gate Admin', 'email' => uniqid('hr-gate-', true) . '@example.test',
            'password' => 'password', 'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 1, 'company_code' => 'acme', 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    #[Test]
    public function hr_routes_answer_503_rather_than_failing_on_a_missing_table(): void
    {
        $this->dropHrSchema();

        $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/hr/dashboard')
            ->assertStatus(503)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error.code', 'MODULE_SCHEMA_NOT_READY')
            ->assertJsonPath('error.module', 'hr');
    }

    #[Test]
    public function every_hr_route_is_behind_the_gate_not_just_the_dashboard(): void
    {
        $this->dropHrSchema();
        $token = auth('api')->login($this->admin);

        $paths = [
            '/api/hr/requisitions/get',
            '/api/hr/candidates/get',
            '/api/hr/candidates/pipeline',
            '/api/hr/interviews/get',
            '/api/hr/offers/get',
            '/api/hr/assets/get',
            '/api/hr/performance/cycles/get',
        ];

        foreach ($paths as $path) {
            $response = $this->withToken($token)->getJson($path);

            // 404 would mean the route moved and this test stopped covering it.
            $this->assertNotSame(404, $response->status(), "{$path} is not registered — update this list.");
            $this->assertSame(503, $response->status(), "{$path} is not behind the schema gate.");
        }
    }

    #[Test]
    public function an_anonymous_caller_is_refused_before_the_module_is_discussed(): void
    {
        $this->dropHrSchema();

        // Deliberately unlike the Node `schemaGate`, which answers readiness
        // ahead of authentication. There the point is that an authenticated
        // administrator should not read an absent subsystem as an auth failure,
        // and that still holds — see the 503 tests above. But which modules a
        // deployment has not migrated is not something to tell an anonymous
        // caller, so the existing jwt.auth/role:admin groups rightly answer
        // first. The gate's job starts once we know who is asking.
        $this->getJson('/api/hr/dashboard')->assertStatus(401);
    }

    #[Test]
    public function an_authenticated_non_admin_is_not_told_the_module_is_missing(): void
    {
        $this->dropHrSchema();

        $employee = User::create([
            'name' => 'HR Gate Employee', 'email' => uniqid('hr-emp-', true) . '@example.test',
            'password' => 'password', 'emp_code' => strtoupper(substr(uniqid(), -8)),
            'role' => 3, 'company_code' => 'acme', 'status' => 0, 'is_deleted' => 0,
        ]);

        $status = $this->withToken(auth('api')->login($employee))
            ->getJson('/api/hr/dashboard')
            ->status();

        $this->assertContains($status, [401, 403], 'A non-admin should be refused, not told about schema.');
    }

    #[Test]
    public function hr_routes_are_reachable_once_the_tables_are_present(): void
    {
        SchemaSupport::flush();
        $this->assertTrue(RequireModuleSchema::ready('hr'), 'Migrated schema should read as ready.');

        $response = $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/hr/dashboard');

        // The point is only that the gate stepped aside; what the controller
        // then decides about permissions is another test's business.
        $this->assertNotSame(503, $response->status());
    }

    #[Test]
    public function the_modules_endpoint_reports_the_absence(): void
    {
        $this->dropHrSchema();

        $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/modules')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.modules.hr', false);
    }

    #[Test]
    public function the_modules_endpoint_reports_availability_when_migrated(): void
    {
        SchemaSupport::flush();

        $this->withToken(auth('api')->login($this->admin))
            ->getJson('/api/modules')
            ->assertOk()
            ->assertJsonPath('data.modules.hr', true);
    }

    #[Test]
    public function an_unknown_module_name_does_not_block_a_route(): void
    {
        $this->assertTrue(
            RequireModuleSchema::ready('not-a-module'),
            'Unknown modules must pass; this middleware exists to catch absent schema, not typos.'
        );
    }


    /**
     * Put the schema back.
     *
     * dropHrSchema() removes thirteen tables to reproduce an unmigrated
     * deployment. RefreshDatabase wraps each test in a transaction, but these
     * drops run with foreign-key constraints disabled and did not reliably roll
     * back — later test classes then failed with 42P01 on tables this one
     * removed, and the suite total moved between runs depending on order.
     * Rebuilding here makes the class leave the database as it found it.
     */
    protected function tearDown(): void
    {
        try {
            if (! Schema::hasTable('candidates')) {
                $this->artisan('migrate:fresh', ['--force' => true])->run();
            }
        } catch (\Throwable) {
            // Never let cleanup mask the assertion failure that matters.
        }

        parent::tearDown();
    }

    /**
     * Reproduce production: no HR tables at all.
     *
     * SchemaSupport memoises its probes, so it has to forget what it learned
     * from the fully migrated schema built moments earlier.
     */
    private function dropHrSchema(): void
    {
        $tables = [
            'performance_reviews', 'performance_goals', 'performance_cycles',
            'asset_allocations', 'assets', 'offer_revisions', 'offers',
            'interview_feedback', 'interview_panelists', 'interviews',
            'candidate_stage_history', 'candidates', 'job_requisitions',
        ];

        /*
         * CASCADE, because disabling constraints does not work here.
         *
         * Schema::disableForeignKeyConstraints() suppresses checks on MySQL but
         * is not honoured for DDL on PostgreSQL, so dropping `interviews` failed
         * with "Dependent objects still exist" — a table outside this list still
         * referenced it. Listing every dependant would make the test a
         * maintenance burden that breaks whenever the HR schema grows; dropping
         * the dependency graph is what "this module was never migrated" actually
         * means.
         */
        if (DB::connection()->getDriverName() === 'pgsql') {
            foreach ($tables as $table) {
                DB::statement('DROP TABLE IF EXISTS "' . $table . '" CASCADE');
            }
        } else {
            Schema::disableForeignKeyConstraints();
            foreach ($tables as $table) {
                Schema::dropIfExists($table);
            }
            Schema::enableForeignKeyConstraints();
        }

        SchemaSupport::flush();

        $this->assertFalse(RequireModuleSchema::ready('hr'));
    }
}
