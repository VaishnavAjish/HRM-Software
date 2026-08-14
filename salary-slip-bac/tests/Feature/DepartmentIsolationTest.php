<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\PermissionRegistrySeeder;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * S6 department tenant isolation for GET /department/get.
 *
 * The endpoint is gated on hr.department.read and scopes in-use department
 * names to the caller's permitted company set; an out-of-scope company request
 * is answered as not-found without revealing existence.
 *
 * Runs on the disposable database only (see phpunit.disposable.xml).
 */
class DepartmentIsolationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
        $this->seed(PermissionRegistrySeeder::class);
        config([
            'authorization.enforcement.default_mode' => 'enforced',
            'authorization.enforcement.enforced_prefixes' => ['hr.', 'ui.', 'self.'],
        ]);
    }

    private function user(int $tier, string $companyCode, array $permissionCodes = []): User
    {
        $user = User::create([
            'name' => 'D' . Str::random(5),
            'email' => Str::lower(Str::random(10)) . '@dept.test',
            'password' => 'x',
            'role' => $tier,
            'company_code' => $companyCode,
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
        ]);

        if ($permissionCodes !== []) {
            $role = Role::create([
                'name' => 'R' . Str::random(5),
                'code' => 'r_' . Str::lower(Str::random(8)),
                'is_active' => true,
                'status' => 'ACTIVE',
            ]);
            foreach ($permissionCodes as $code) {
                $perm = Permission::where('code', $code)->first();
                if ($perm) {
                    DB::table('role_permissions')->updateOrInsert(
                        ['role_id' => $role->id, 'permission_id' => $perm->id],
                        ['effect' => 'ALLOW', 'inherit_to_children' => true]
                    );
                }
            }
            $user->roles()->syncWithoutDetaching([$role->id]);
        }

        return $user;
    }

    private function employeeInDept(string $companyCode, string $department): void
    {
        User::create([
            'name' => 'E' . Str::random(5),
            'email' => Str::lower(Str::random(10)) . '@dept.test',
            'password' => 'x',
            'role' => 3,
            'company_code' => $companyCode,
            'emp_code' => strtoupper(Str::random(8)),
            'department' => $department,
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    public function test_requires_department_read_permission(): void
    {
        $user = $this->user(2, 'nidhi-impex'); // no grant

        $this->withToken(auth('api')->login($user))
            ->getJson('/api/department/get')
            ->assertForbidden();
    }

    public function test_tenant_admin_sees_only_own_company_in_use_departments(): void
    {
        $this->employeeInDept('nidhi-impex', 'Nidhi Ops');
        $this->employeeInDept('silver-star', 'Silver Secret Unit');

        $admin = $this->user(2, 'nidhi-impex', ['hr.department.read']);

        $names = collect(
            $this->withToken(auth('api')->login($admin))
                ->getJson('/api/department/get')
                ->assertOk()
                ->json('data')
        )->pluck('name')->all();

        $this->assertContains('Nidhi Ops', $names);
        $this->assertNotContains('Silver Secret Unit', $names, 'A tenant admin must not see another company\'s departments.');
    }

    public function test_out_of_scope_company_request_is_denied_consistently(): void
    {
        $this->employeeInDept('silver-star', 'Silver Secret Unit');
        $admin = $this->user(2, 'nidhi-impex', ['hr.department.read']);
        $token = auth('api')->login($admin);

        // A company that exists but is out of scope, and one that does not exist,
        // must be indistinguishable (the request layer denies both the same way,
        // revealing nothing about existence). Under enforced mode the permission
        // scope check returns 403; under shadow the controller returns 404 — the
        // contract is that both requests get the SAME non-2xx answer.
        $existing = $this->withToken($token)->getJson('/api/department/get?company_code=silver-star');
        $absent = $this->withToken($token)->getJson('/api/department/get?company_code=does-not-exist');

        $this->assertContains($existing->status(), [403, 404]);
        $this->assertSame(
            $existing->status(),
            $absent->status(),
            'An out-of-scope company that exists must be indistinguishable from one that does not.'
        );
    }

    public function test_csv_membership_is_parsed_as_a_set(): void
    {
        $this->employeeInDept('silver-star', 'Silver Ops');
        // Admin belongs to both companies via a CSV company_code.
        $admin = $this->user(2, 'nidhi-impex,silver-star', ['hr.department.read']);

        $names = collect(
            $this->withToken(auth('api')->login($admin))
                ->getJson('/api/department/get?company_code=silver-star')
                ->assertOk()
                ->json('data')
        )->pluck('name')->all();

        $this->assertContains('Silver Ops', $names, 'CSV membership must grant access to each listed company.');
    }

    public function test_global_admin_sees_all_in_use_departments(): void
    {
        $this->employeeInDept('nidhi-impex', 'Nidhi Ops');
        $this->employeeInDept('silver-star', 'Silver Secret Unit');

        $admin = $this->user(1, 'nidhi-impex', ['hr.department.read']);

        $names = collect(
            $this->withToken(auth('api')->login($admin))
                ->getJson('/api/department/get')
                ->assertOk()
                ->json('data')
        )->pluck('name')->all();

        $this->assertContains('Nidhi Ops', $names);
        $this->assertContains('Silver Secret Unit', $names);
    }

    public function test_agent_form_page_grant_reaches_the_department_picker(): void
    {
        $this->employeeInDept('nidhi-impex', 'Nidhi Ops');

        // The agent holds the appointments page node, which implies
        // hr.department.read. As in production, the operator materialises that
        // implication into the role with authz:project-implied-codes before the
        // grant takes effect under enforcement.
        $role = Role::create([
            'name' => 'AgentAppt' . Str::random(4),
            'code' => 'agent_appt_' . Str::lower(Str::random(6)),
            'is_active' => true,
            'status' => 'ACTIVE',
        ]);
        $node = Permission::where('code', 'ui.portals.agent_appointments')->first();
        DB::table('role_permissions')->updateOrInsert(
            ['role_id' => $role->id, 'permission_id' => $node->id],
            ['effect' => 'ALLOW', 'inherit_to_children' => true]
        );

        \Illuminate\Support\Facades\Artisan::call('authz:project-implied-codes', [
            '--apply' => true,
            '--role' => $role->code,
        ]);

        $agent = User::create([
            'name' => 'Agent' . Str::random(5),
            'email' => Str::lower(Str::random(10)) . '@dept.test',
            'password' => 'x',
            'role' => 4,
            'company_code' => 'nidhi-impex',
            'emp_code' => strtoupper(Str::random(8)),
            'status' => 0,
            'is_deleted' => 0,
        ]);
        $agent->roles()->syncWithoutDetaching([$role->id]);

        $this->withToken(auth('api')->login($agent))
            ->getJson('/api/department/get')
            ->assertOk();
    }

    public function test_get_writes_no_department_rows(): void
    {
        $this->employeeInDept('nidhi-impex', 'Brand New Freetext Dept');
        $admin = $this->user(1, 'nidhi-impex', ['hr.department.read']);

        $before = DB::table('departments')->count();

        $this->withToken(auth('api')->login($admin))
            ->getJson('/api/department/get')
            ->assertOk();

        $this->assertSame($before, DB::table('departments')->count(), 'GET must not persist department rows.');
    }
}
