<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Company scoping of the employee list, captured before porting it.
 *
 * UserController::index no longer scopes inline; it delegates to
 * Services\Authorization\AuthorizedUserQuery, which returns the query
 * untouched for role 0 AND role 1:
 *
 *     if ((int) $actor->role === 0 || (int) $actor->role === 1) {
 *         return $query;
 *     }
 *
 * show() still narrows role 1 to their own company codes. These tests record
 * whether list and show therefore disagree — a role 1 admin seeing rows in the
 * list that they cannot open individually.
 *
 * The controller is mid-edit (146 uncommitted insertions), so this is a
 * characterisation test of the current working tree, not an assertion that the
 * behaviour is intended.
 */
class EmployeeListScopeTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function admin(int $role, string $company): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Admin {$n}", 'email' => "scope-admin-{$n}@test.local",
            'password' => 'x', 'role' => $role, 'company_code' => $company,
            'unit' => 'Ichapur', 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function employee(string $company, string $unit = 'Ichapur'): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Worker {$n}", 'email' => "scope-emp-{$n}@test.local",
            'password' => 'x', 'role' => 3, 'company_code' => $company, 'unit' => $unit,
            'emp_code' => "W{$n}", 'mobile_number' => '9876543210',
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function listFor(User $actor)
    {
        return $this->withToken(auth('api')->login($actor))->getJson('/api/employee/get');
    }

    private function rows($response): array
    {
        return $response->json('data.users.data') ?? [];
    }

    public function test_a_super_admin_sees_every_company(): void
    {
        $this->employee('nidhi-impex');
        $this->employee('silver-star');

        $rows = $this->rows($this->listFor($this->admin(0, 'nidhi-impex'))->assertOk());

        $this->assertCount(2, $rows);
    }

    /**
     * The behaviour in question.
     *
     * AuthorizedUserQuery exempts role 1 from scoping entirely, so this admin's
     * list includes the other company's employee.
     */
    public function test_a_role_1_admin_list_is_not_scoped_to_their_company(): void
    {
        $this->employee('nidhi-impex');
        $other = $this->employee('silver-star');

        $rows = $this->rows($this->listFor($this->admin(1, 'nidhi-impex'))->assertOk());
        $codes = array_column($rows, 'company_code');

        $this->assertContains('silver-star', $codes,
            'role 1 list was scoped after all — AuthorizedUserQuery may have changed');
        $this->assertContains($other->name, array_column($rows, 'name'));
    }

    /**
     * ...while show() does scope role 1, so the same admin cannot open the row
     * the list just handed them.
     */
    public function test_but_that_admin_cannot_open_the_other_companys_employee(): void
    {
        $other = $this->employee('silver-star');
        $actor = $this->admin(1, 'nidhi-impex');

        $this->withToken(auth('api')->login($actor))
            ->getJson("/api/employee/show/{$other->id}")
            ->assertStatus(404);
    }

    public function test_role_2_is_scoped_to_company_and_unit(): void
    {
        $this->employee('nidhi-impex', 'Ichapur');
        $this->employee('nidhi-impex', 'Daduk');
        $this->employee('silver-star', 'Ichapur');

        $rows = $this->rows($this->listFor($this->admin(2, 'nidhi-impex'))->assertOk());

        $this->assertCount(1, $rows);
        $this->assertSame('nidhi-impex', $rows[0]['company_code']);
        $this->assertSame('Ichapur', $rows[0]['unit']);
    }

    /** A comma-separated company_code grants several companies at once. */
    public function test_a_multi_company_admin_sees_each_of_their_companies(): void
    {
        $this->employee('nidhi-impex');
        $this->employee('silver-star');
        $this->employee('third-co');

        $rows = $this->rows(
            $this->listFor($this->admin(2, 'nidhi-impex,silver-star'))->assertOk(),
        );

        $codes = array_unique(array_column($rows, 'company_code'));
        sort($codes);
        $this->assertSame(['nidhi-impex', 'silver-star'], $codes);
    }

    public function test_an_admin_with_no_company_sees_nothing(): void
    {
        $this->employee('nidhi-impex');

        // AuthorizedUserQuery falls through to whereRaw('1 = 0') rather than
        // returning everything, which is the safe direction.
        $rows = $this->rows($this->listFor($this->admin(2, ''))->assertOk());

        $this->assertCount(0, $rows);
    }

    public function test_the_list_excludes_admins_appointments_and_agents(): void
    {
        $this->employee('nidhi-impex');
        User::create([
            'name' => 'Candidate', 'email' => 'scope-cand@test.local', 'password' => 'x',
            'role' => 3, 'type' => 'appointment', 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);

        $rows = $this->rows($this->listFor($this->admin(0, 'nidhi-impex'))->assertOk());

        $this->assertCount(1, $rows);
        $this->assertSame('Worker 1', $rows[0]['name']);
    }

    public function test_the_response_shape_the_client_reads(): void
    {
        $this->employee('nidhi-impex');

        $body = $this->listFor($this->admin(0, 'nidhi-impex'))->assertOk()->json();

        $this->assertTrue($body['status']);
        foreach (['total', 'per_page', 'current_page', 'last_page'] as $key) {
            $this->assertArrayHasKey($key, $body['data']['users'], "missing {$key}");
        }
        $this->assertArrayHasKey('active_users', $body['data']);
        $this->assertArrayHasKey('inactive_users', $body['data']);
    }

    public function test_the_list_never_exposes_the_raw_aadhaar_column(): void
    {
        $this->employee('nidhi-impex');

        $body = $this->listFor($this->admin(0, 'nidhi-impex'))->assertOk()->json('data.users.data');

        $this->assertArrayNotHasKey('aadhar_card_no', $body[0]);
        $this->assertArrayNotHasKey('password', $body[0]);
        $this->assertArrayHasKey('aadhaar_masked', $body[0]);
    }
}
