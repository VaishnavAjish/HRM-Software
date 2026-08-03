<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The appointment endpoints are staff endpoints and must prove it.
 *
 * GET /appointment, POST /appointment and GET /appointment/check-emp-code were
 * declared above the jwt.auth group in routes/api.php, so they were reachable
 * with no credentials at all. getAppointment() reads the caller with
 * auth('api')->user() and then scopes the query by that caller's role — agents
 * to their own candidates, role 1 to their company, role 2 to company+unit. For
 * an anonymous caller the user is null, every branch falls through, and the
 * remaining `elseif ($request->company_code)` is attacker-controlled: omit the
 * parameter and the query is never scoped at all, returning every appointment
 * record in the database across every company, each one serialised with
 * attributesToArray() — name, email, mobile, address, PAN, bank details.
 *
 * No page in the app submits these anonymously: every frontend route sits
 * behind ProtectedRoute, and the API client attaches a bearer token to all
 * three calls.
 *
 * GET /check-emp-code/{code} is different and deliberately stays public — the
 * login screen calls it before anyone has a token — so it is covered here to
 * pin that distinction down rather than have a later tightening pass break the
 * account-claim flow.
 */
class AppointmentEndpointAuthTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function admin(string $company = 'nidhi-impex'): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Admin {$n}", 'email' => "auth-admin-{$n}@test.local",
            'password' => 'x', 'role' => 0, 'company_code' => $company,
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function agent(string $company = 'nidhi-impex'): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Agent {$n}", 'email' => "auth-agent-{$n}@test.local",
            'password' => 'x', 'role' => 4, 'type' => 'agent',
            'company_code' => $company, 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function employee(): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Worker {$n}", 'email' => "auth-emp-{$n}@test.local",
            'password' => 'x', 'role' => 3, 'company_code' => 'nidhi-impex',
            'emp_code' => "E{$n}", 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    /** A pending appointment record, carrying the PII a real one carries. */
    private function appointment(string $company, ?User $addedBy = null): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Candidate {$n}", 'email' => "cand-{$n}@test.local",
            'password' => 'x', 'role' => 3, 'type' => 'appointment',
            'company_code' => $company, 'unit' => 'Ichapur',
            'mobile_number' => '9876543210', 'pan_card_no' => 'ABCDE1234E',
            'address' => '12 Example Road', 'account_no' => '00112233445566',
            'added_by' => $addedBy?->id, 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    // ---- the exposure -----------------------------------------------------

    public function test_the_appointment_list_is_not_readable_without_a_token(): void
    {
        $this->appointment('nidhi-impex');

        $this->getJson('/api/appointment')->assertUnauthorized();
    }

    public function test_an_anonymous_caller_cannot_harvest_every_company(): void
    {
        $this->appointment('nidhi-impex');
        $this->appointment('silver-star');

        // Omitting company_code was the trigger: with no authenticated user and
        // no company filter, nothing narrowed the query.
        $response = $this->getJson('/api/appointment');

        $response->assertUnauthorized();
        $this->assertStringNotContainsString('Candidate', $response->getContent());
    }

    public function test_an_anonymous_caller_cannot_widen_scope_with_all_companies(): void
    {
        $this->appointment('nidhi-impex');
        $this->appointment('silver-star');

        // 'all' short-circuits the whereIn, so even the parameterised form gave
        // an anonymous caller everything.
        $this->getJson('/api/appointment?company_code=all')->assertUnauthorized();
    }

    public function test_no_personal_data_leaves_the_endpoint_anonymously(): void
    {
        $this->appointment('nidhi-impex');

        $body = $this->getJson('/api/appointment')->getContent();

        foreach (['9876543210', 'ABCDE1234E', '12 Example Road', '00112233445566'] as $secret) {
            $this->assertStringNotContainsString($secret, $body);
        }
    }

    public function test_appointments_cannot_be_created_without_a_token(): void
    {
        $this->postJson('/api/appointment', [
            'name' => 'Walk In', 'company_code' => 'nidhi-impex',
        ])->assertUnauthorized();

        $this->assertDatabaseMissing('users', ['name' => 'Walk In']);
    }

    public function test_the_appointment_employee_code_lookup_requires_a_token(): void
    {
        $this->employee();

        $this->getJson('/api/appointment/check-emp-code?emp_code=E1')->assertUnauthorized();
    }

    // ---- what must keep working ------------------------------------------

    public function test_an_admin_can_still_read_the_list(): void
    {
        $admin = $this->admin();
        $this->appointment('nidhi-impex');

        $response = $this->withToken(auth('api')->login($admin))->getJson('/api/appointment');

        $response->assertOk();
        $this->assertNotEmpty($response->json('data') ?? $response->json());
    }

    public function test_an_agent_still_sees_only_their_own_candidates(): void
    {
        $agent = $this->agent();
        $other = $this->agent();
        $this->appointment('nidhi-impex', $agent);
        $this->appointment('nidhi-impex', $other);

        $response = $this->withToken(auth('api')->login($agent))->getJson('/api/appointment');

        $response->assertOk();
        $rows = $response->json('data') ?? $response->json();
        $this->assertCount(1, $rows, 'an agent saw another agent\'s candidate');
    }

    public function test_an_employee_may_not_read_the_appointment_list(): void
    {
        $employee = $this->employee();
        $this->appointment('nidhi-impex');

        $this->withToken(auth('api')->login($employee))
            ->getJson('/api/appointment')
            ->assertForbidden();
    }

    public function test_an_admin_can_still_create_an_appointment(): void
    {
        $admin = $this->admin();

        $this->withToken(auth('api')->login($admin))
            ->postJson('/api/appointment', [
                'name' => 'Walk In', 'company_code' => 'nidhi-impex', 'unit' => 'Ichapur',
            ])->assertSuccessful();

        $this->assertDatabaseHas('users', ['name' => 'Walk In']);
    }

    /**
     * The login screen looks this up before anyone has a token, so it is the
     * one emp-code endpoint that must stay open. Locking it down here would
     * break the account-claim flow, which is exactly the kind of collateral a
     * blanket "authenticate everything" sweep causes.
     */
    public function test_the_login_screen_can_still_look_up_an_employee_code(): void
    {
        $employee = $this->employee();

        $this->getJson("/api/check-emp-code/{$employee->emp_code}")
            ->assertOk()
            ->assertJson(['status' => true]);
    }
}
