<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Company scoping of the employee list, captured before porting it.
 *
 * These record what index() does today, so a change to it is visible rather
 * than silent. That has already earned its keep: during one session index()
 * held three different scoping implementations — inline role checks, a
 * delegation to Services\Authorization\AuthorizedUserQuery that exempted role 1
 * from scoping entirely, and then the inline checks again after a rollback.
 * Each change moved these assertions.
 *
 * The controller is under active edit, so this is a characterisation of the
 * current working tree, not a statement that the behaviour is intended. Two
 * findings are pinned deliberately: list and show must agree on scope, and a
 * comma-separated company_code currently matches nothing.
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
     * Role 1 is scoped to its own company.
     *
     * This assertion has been rewritten twice in one session. index() has held
     * three different scoping implementations: inline role checks, a delegation
     * to Services\Authorization\AuthorizedUserQuery which exempted role 1
     * entirely, and now the inline checks again. Whatever else changes, list
     * and show must agree — that is what this pins.
     */
    public function test_a_role_1_admin_list_is_scoped_to_their_company(): void
    {
        $this->employee('nidhi-impex');
        $this->employee('silver-star');

        $rows = $this->rows($this->listFor($this->admin(1, 'nidhi-impex'))->assertOk());
        $codes = array_column($rows, 'company_code');

        $this->assertNotContains('silver-star', $codes);
        $this->assertSame(['nidhi-impex'], array_values(array_unique($codes)));
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

    /**
     * A comma-separated company_code currently matches nothing.
     *
     * index() compares with where('company_code', $userAuth->company_code) — an
     * exact string match — so an admin holding 'nidhi-impex,silver-star' is
     * compared against that whole string and matches no employee. Such an admin
     * sees an empty employee list, with HTTP 200 and total 0 rather than an
     * error, so it presents as "there are no employees".
     *
     * An earlier revision of index() handled this by splitting the value and
     * using whereIn; that revision has since been rolled back.
     */
    public function test_a_multi_company_admin_currently_sees_nothing(): void
    {
        $this->employee('nidhi-impex');
        $this->employee('silver-star');
        $this->employee('third-co');

        $response = $this->listFor($this->admin(2, 'nidhi-impex,silver-star'))->assertOk();

        // Documented as-is. Change this assertion only alongside a fix.
        $this->assertCount(0, $this->rows($response));
        $this->assertSame(0, $response->json('data.users.total'));
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
