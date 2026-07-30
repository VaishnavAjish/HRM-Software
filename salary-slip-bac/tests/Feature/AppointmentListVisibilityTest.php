<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

/**
 * A freshly created appointment must appear on the Appointments page.
 *
 * The page reported "No appointment forms found" with Total 0 straight after a
 * submission, so these tests walk the exact route the UI takes — POST
 * /v1/appointments to create, then GET /appointment with the company scope the
 * header selector sends — rather than testing the query in isolation.
 */
class AppointmentListVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function superAdmin(): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Admin {$n}", 'email' => "list-admin-{$n}@test.local",
            'password' => 'x', 'role' => 0, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    /**
     * The v1 save-first endpoint (POST /v1/appointments).
     *
     * Not what the modal actually uses — kept because both paths must produce a
     * visible row, and testing only one of them is how a create path ends up
     * writing records the list cannot match.
     */
    private function createViaApi(User $actor, array $overrides = [])
    {
        $n = ++$this->seq;

        return $this->withToken(auth('api')->login($actor))
            ->postJson('/api/v1/appointments', array_merge([
                'name' => "Candidate {$n}",
                'email' => "cand-{$n}@test.local",
                'mobile_number' => '9876543210',
                'aadhar_card_no' => '7151 1598 8793',
                'company_code' => 'nidhi-impex',
                'unit' => 'Ichapur',
            ], $overrides));
    }

    /**
     * What AppointmentModal actually posts: multipart to POST /appointment,
     * handled by UserController::appointmentStore. The name arrives as a JSON
     * object because the form collects first/mid/surname separately.
     */
    private function submitViaForm(?User $actor, array $overrides = [])
    {
        $n = ++$this->seq;

        $payload = array_merge([
            'name' => json_encode(['first' => 'Parth', 'mid' => 'R', 'surname' => "Patel{$n}"]),
            'email' => "form-cand-{$n}@test.local",
            'mobile_number' => '9876543210',
            'aadhar_card_no' => '7151 1598 8793',
            'company_code' => 'nidhi-impex',
            'unit' => 'Ichapur',
            'joining_date' => '2026-07-01',
            'department' => 'Production',
            'designation' => 'Operator',
        ], $overrides);

        $request = $actor
            ? $this->withToken(auth('api')->login($actor))
            : $this;

        return $request->post('/api/appointment', $payload);
    }

    private function list(User $actor, array $query = [])
    {
        return $this->withToken(auth('api')->login($actor))
            ->getJson('/api/appointment'.($query ? '?'.http_build_query($query) : ''));
    }

    public function test_a_new_appointment_appears_immediately(): void
    {
        $admin = $this->superAdmin();

        $this->createViaApi($admin)->assertStatus(201);

        $response = $this->list($admin);

        $response->assertOk();
        $this->assertCount(1, $response->json('data.appointments'));
    }

    /**
     * The header selector sends every configured company id when "Both
     * Companies" is chosen, so the list must match on that comma-separated list.
     */
    public function test_it_appears_under_the_both_companies_scope(): void
    {
        $admin = $this->superAdmin();

        $this->createViaApi($admin)->assertStatus(201);

        $response = $this->list($admin, ['company_code' => 'nidhi-impex,silver-star']);

        $response->assertOk();
        $this->assertCount(1, $response->json('data.appointments'));
    }

    /**
     * The company dropdown offers "silver-star"; a record filed under it must be
     * visible under the same id it was stored with.
     */
    public function test_a_silver_star_appointment_appears_under_that_scope(): void
    {
        $admin = $this->superAdmin();

        $this->createViaApi($admin, ['company_code' => 'silver-star'])->assertStatus(201);

        $response = $this->list($admin, ['company_code' => 'nidhi-impex,silver-star']);

        $response->assertOk();
        $this->assertCount(1, $response->json('data.appointments'));
    }

    public function test_the_row_carries_what_the_grid_renders(): void
    {
        $admin = $this->superAdmin();
        $this->createViaApi($admin)->assertStatus(201);

        $row = $this->list($admin)->json('data.appointments.0');

        // The columns the page shows, plus the id its View action needs.
        $this->assertNotNull($row['id']);
        $this->assertSame('appointment', $row['type']);
        $this->assertArrayHasKey('agent', $row);
        $this->assertSame('715115988793', $row['aadhaar_full']);
    }

    public function test_an_appointment_without_a_unit_still_appears(): void
    {
        $admin = $this->superAdmin();

        $this->createViaApi($admin, ['unit' => null])->assertStatus(201);

        $this->assertCount(1, $this->list($admin)->json('data.appointments'));
    }

    /**
     * A unit filter is only sent when a branch is actually chosen. An empty one
     * arriving as "" must not silently exclude every row.
     */
    public function test_an_empty_unit_filter_does_not_hide_everything(): void
    {
        $admin = $this->superAdmin();
        $this->createViaApi($admin)->assertStatus(201);

        $response = $this->list($admin, ['company_code' => 'nidhi-impex,silver-star', 'unit' => '']);

        $response->assertOk();
        $this->assertCount(1, $response->json('data.appointments'));
    }

    // ------------------------------------------- the path the modal really takes

    public function test_a_form_submission_appears_in_the_list(): void
    {
        $admin = $this->superAdmin();

        $this->submitViaForm($admin)->assertOk();

        $response = $this->list($admin, ['company_code' => 'nidhi-impex,silver-star']);

        $response->assertOk();
        $this->assertCount(1, $response->json('data.appointments'));
    }

    public function test_a_form_submission_is_stored_as_an_appointment(): void
    {
        $admin = $this->superAdmin();

        $this->submitViaForm($admin)->assertOk();

        // The two columns the list query filters on.
        $this->assertDatabaseHas('users', ['type' => 'appointment', 'role' => 3]);
    }

    /**
     * The public, unauthenticated job-application form posts to the same route.
     * Nothing about the list depends on who submitted it.
     */
    public function test_an_unauthenticated_submission_appears_for_an_admin(): void
    {
        $this->submitViaForm(null)->assertOk();

        $admin = $this->superAdmin();
        $response = $this->list($admin, ['company_code' => 'nidhi-impex,silver-star']);

        $response->assertOk();
        $this->assertCount(1, $response->json('data.appointments'));
    }

    /**
     * An emp_code is optional on submission, and supplying one must not change
     * whether the record is listed.
     */
    public function test_a_submission_carrying_an_emp_code_appears(): void
    {
        $admin = $this->superAdmin();

        $this->submitViaForm($admin, ['emp_code' => 'EMP7788'])->assertOk();

        $response = $this->list($admin, ['company_code' => 'nidhi-impex,silver-star']);

        $response->assertOk();
        $this->assertCount(1, $response->json('data.appointments'));
    }

    // ------------------------------------------------ audit must not break reads

    /**
     * This is what actually emptied the page.
     *
     * Disclosing the full Aadhaar added an audit write to these read endpoints,
     * and the write was not isolated — so in any environment where
     * document_audit_logs is missing or unwritable (the document tables migration
     * not yet applied, a permissions problem, a column-type difference on
     * PostgreSQL) the whole request returned 500. The client catches that and
     * renders an empty grid, so a logging fault presented as "no appointment
     * forms found" with Total 0.
     *
     * Reads now degrade to unaudited rather than failing. The confidential-export
     * path deliberately still fails closed — see AadhaarConfidentialExportTest.
     */
    private function breakAuditTable(): void
    {
        Schema::disableForeignKeyConstraints();
        Schema::drop('document_audit_logs');
    }

    public function test_the_appointment_list_survives_an_unwritable_audit_table(): void
    {
        $admin = $this->superAdmin();
        $this->submitViaForm($admin)->assertOk();

        $this->breakAuditTable();

        $response = $this->list($admin, ['company_code' => 'nidhi-impex,silver-star']);

        $response->assertOk();
        $this->assertCount(1, $response->json('data.appointments'));
        // Still discloses; only the trail is lost.
        $this->assertSame('715115988793', $response->json('data.appointments.0.aadhaar_full'));
    }

    public function test_appointment_details_survive_an_unwritable_audit_table(): void
    {
        $admin = $this->superAdmin();
        $this->submitViaForm($admin)->assertOk();
        $id = User::where('type', 'appointment')->value('id');

        $this->breakAuditTable();

        $this->withToken(auth('api')->login($admin))
            ->getJson("/api/v1/appointments/{$id}")
            ->assertOk()
            ->assertJsonPath('data.appointment.aadhaar_full', '715115988793');
    }

    public function test_the_employee_list_survives_an_unwritable_audit_table(): void
    {
        $admin = $this->superAdmin();
        $employee = User::create([
            'name' => 'Ravi', 'email' => 'audit-emp@test.local', 'password' => 'x',
            'role' => 3, 'emp_code' => 'EMP4321', 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);
        $employee->forceFill(['aadhar_card_no' => '715115988793'])->save();

        $this->breakAuditTable();

        $this->withToken(auth('api')->login($admin))
            ->getJson('/api/employee/get')
            ->assertOk();
    }

    public function test_the_profile_survives_an_unwritable_audit_table(): void
    {
        $employee = User::create([
            'name' => 'Self', 'email' => 'audit-self@test.local', 'password' => 'x',
            'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0, 'is_deleted' => 0,
        ]);
        $employee->forceFill(['aadhar_card_no' => '715115988793'])->save();

        $this->breakAuditTable();

        $this->withToken(auth('api')->login($employee->fresh()))
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('user.aadhaar_full', '715115988793');
    }
}
