<?php

namespace Tests\Feature;

use App\Models\DocumentAuditLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Full-Aadhaar disclosure on the appointment surface.
 *
 * The gate is record access: reaching an appointment means seeing its Aadhaar in
 * full, on the details endpoint and in the list. There is no separate permission
 * and no masked variant of an authorised page.
 *
 * So what these tests defend is the boundary that still exists — organisation,
 * company and unit scope. Every refusal case also asserts the number is absent
 * from the response body, because a 403 that happens to carry the value in an
 * error payload would satisfy a status assertion while leaking what it protects.
 */
class AadhaarRevealTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function makeUser(int $role, string $company = 'nidhi-impex', ?string $unit = null): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Actor {$n}", 'email' => "reveal-actor-{$n}@test.local",
            'password' => 'x', 'role' => $role, 'company_code' => $company,
            'unit' => $unit, 'status' => 0,
        ]);
    }

    private function makeAppointment(string $aadhaar = '123456788793', string $company = 'nidhi-impex'): User
    {
        $n = ++$this->seq;

        $appointment = User::create([
            'name' => 'Parth R Patel', 'email' => "reveal-appt-{$n}@test.local",
            'password' => 'x', 'role' => 3, 'type' => 'appointment',
            'company_code' => $company, 'unit' => 'Ichapur', 'status' => 0,
        ]);

        $appointment->forceFill(['aadhar_card_no' => $aadhaar])->save();

        return $appointment;
    }

    private function reveal(User $actor, User $appointment)
    {
        return $this->withToken(auth('api')->login($actor))
            ->postJson("/api/v1/appointments/{$appointment->id}/aadhaar/reveal");
    }

    // ------------------------------------------------------------- disclosure

    public function test_a_super_admin_can_reveal_the_number(): void
    {
        $response = $this->reveal($this->makeUser(0), $this->makeAppointment());

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.aadhaarNumber', '123456788793');
    }

    public function test_a_company_admin_in_the_same_company_needs_no_grant(): void
    {
        // The earlier design refused this until someone was granted
        // appointments.view_full_aadhaar. Record access is now the whole rule:
        // this actor can already open the appointment, so withholding the number
        // only produced a masked page next to an unmasked one.
        $this->reveal($this->makeUser(1), $this->makeAppointment())
            ->assertOk()
            ->assertJsonPath('data.aadhaarNumber', '123456788793');
    }

    public function test_a_manager_in_the_matching_unit_sees_it(): void
    {
        $manager = $this->makeUser(2, 'nidhi-impex', 'Ichapur');

        $this->reveal($manager, $this->makeAppointment())
            ->assertOk()
            ->assertJsonPath('data.aadhaarNumber', '123456788793');
    }

    // ------------------------------------------------------------------ scope

    public function test_a_cross_company_actor_is_refused(): void
    {
        $outsider = $this->makeUser(1, 'silver-star');

        $response = $this->reveal($outsider, $this->makeAppointment('123456788793', 'nidhi-impex'));

        $response->assertStatus(403)
            ->assertJsonPath('error.code', 'APPOINTMENT_ACCESS_DENIED');

        $this->assertStringNotContainsString('123456788793', $response->getContent());
    }

    public function test_a_manager_in_another_unit_is_refused(): void
    {
        // Unit scope, not seniority: same company, wrong unit.
        $manager = $this->makeUser(2, 'nidhi-impex', 'Daduk');

        $response = $this->reveal($manager, $this->makeAppointment());

        $response->assertStatus(403);
        $this->assertStringNotContainsString('123456788793', $response->getContent());
    }

    public function test_a_plain_employee_cannot_reach_another_persons_appointment(): void
    {
        $employee = $this->makeUser(3);

        $response = $this->reveal($employee, $this->makeAppointment());

        $response->assertStatus(403);
        $this->assertStringNotContainsString('123456788793', $response->getContent());
    }

    public function test_an_unauthenticated_request_is_rejected(): void
    {
        $appointment = $this->makeAppointment();

        $this->postJson("/api/v1/appointments/{$appointment->id}/aadhaar/reveal")
            ->assertStatus(401);
    }

    public function test_a_missing_appointment_returns_not_found(): void
    {
        $this->withToken(auth('api')->login($this->makeUser(0)))
            ->postJson('/api/v1/appointments/999999/aadhaar/reveal')
            ->assertStatus(404);
    }

    public function test_an_appointment_without_an_aadhaar_returns_a_safe_error(): void
    {
        $this->reveal($this->makeUser(0), $this->makeAppointment(''))
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'APPOINTMENT_AADHAAR_MISSING');
    }

    public function test_a_malformed_stored_aadhaar_returns_the_same_safe_error(): void
    {
        $response = $this->reveal($this->makeUser(0), $this->makeAppointment('1234'));

        $response->assertStatus(404)->assertJsonPath('error.code', 'APPOINTMENT_AADHAAR_MISSING');
        // The partial value must not leak through the error path either.
        $this->assertStringNotContainsString('1234"', $response->getContent());
    }

    public function test_the_response_forbids_caching(): void
    {
        $response = $this->reveal($this->makeUser(0), $this->makeAppointment());

        $cacheControl = $response->headers->get('Cache-Control');
        $this->assertStringContainsString('no-store', $cacheControl);
        $this->assertStringContainsString('private', $cacheControl);
        $this->assertSame('no-cache', $response->headers->get('Pragma'));
        $this->assertSame('0', $response->headers->get('Expires'));
    }

    // ------------------------------------------------------------------ audit

    public function test_a_successful_reveal_is_audited_without_the_number(): void
    {
        $actor = $this->makeUser(0);
        $appointment = $this->makeAppointment();

        $this->reveal($actor, $appointment)->assertOk();

        $entry = DocumentAuditLog::where('action', 'APPOINTMENT_AADHAAR_REVEALED')->latest('id')->first();

        $this->assertNotNull($entry);
        $this->assertSame($actor->id, $entry->actor_user_id);
        $this->assertSame('RECORD_ACCESS', $entry->permission);
        $this->assertSame('ALLOWED', $entry->permission_result);
        $this->assertSame($appointment->id, $entry->metadata['appointment_id']);
        $this->assertSame('8793', $entry->metadata['aadhaar_last4']);

        // The audit trail records that a reveal happened, not the number itself.
        $this->assertStringNotContainsString('123456788793', json_encode($entry->toArray()));
    }

    public function test_a_refused_reveal_is_audited(): void
    {
        $outsider = $this->makeUser(1, 'silver-star');

        $this->reveal($outsider, $this->makeAppointment())->assertStatus(403);

        $entry = DocumentAuditLog::where('permission_result', 'DENIED')->latest('id')->first();

        $this->assertNotNull($entry);
        $this->assertSame($outsider->id, $entry->actor_user_id);
        $this->assertStringNotContainsString('123456788793', json_encode($entry->toArray()));
    }

    public function test_a_print_recheck_is_audited_under_its_own_action(): void
    {
        $appointment = $this->makeAppointment();

        $this->withToken(auth('api')->login($this->makeUser(0)))
            ->postJson("/api/v1/appointments/{$appointment->id}/aadhaar/reveal", ['context' => 'PRINT'])
            ->assertOk()
            ->assertJsonPath('data.aadhaarNumber', '123456788793');

        $entry = DocumentAuditLog::where('action', 'APPOINTMENT_FULL_AADHAAR_PRINTED')->first();
        $this->assertNotNull($entry);
        $this->assertSame('PRINT', $entry->metadata['context']);
    }

    public function test_a_pdf_recheck_is_audited_under_its_own_action(): void
    {
        $appointment = $this->makeAppointment();

        $this->withToken(auth('api')->login($this->makeUser(0)))
            ->postJson("/api/v1/appointments/{$appointment->id}/aadhaar/reveal", ['context' => 'PDF'])
            ->assertOk();

        $this->assertNotNull(
            DocumentAuditLog::where('action', 'APPOINTMENT_FULL_AADHAAR_PDF_DOWNLOADED')->first(),
        );
    }

    // ----------------------------------------------------- details and lists

    public function test_the_details_endpoint_gives_an_authorised_actor_the_full_number(): void
    {
        $appointment = $this->makeAppointment();

        $response = $this->withToken(auth('api')->login($this->makeUser(0)))
            ->getJson("/api/v1/appointments/{$appointment->id}");

        $response->assertOk()
            ->assertJsonPath('data.appointment.aadhaar_full', '123456788793')
            // aadhaar_masked stays for API compatibility; the raw column never
            // appears, because aadhaar_full is added explicitly per response.
            ->assertJsonPath('data.appointment.aadhaar_masked', 'XXXX XXXX 8793')
            ->assertJsonMissingPath('data.appointment.aadhar_card_no');
    }

    public function test_a_cross_company_actor_gets_no_details_at_all(): void
    {
        $appointment = $this->makeAppointment('123456788793', 'nidhi-impex');
        $outsider = $this->makeUser(1, 'silver-star');

        $response = $this->withToken(auth('api')->login($outsider))
            ->getJson("/api/v1/appointments/{$appointment->id}");

        // Not "the masked version" — nothing.
        $response->assertStatus(403);
        $this->assertStringNotContainsString('123456788793', $response->getContent());
        $this->assertStringNotContainsString('aadhaar_full', $response->getContent());
    }

    public function test_viewing_the_details_audits_the_sensitive_access_once(): void
    {
        $actor = $this->makeUser(0);
        $appointment = $this->makeAppointment();

        $this->withToken(auth('api')->login($actor))
            ->getJson("/api/v1/appointments/{$appointment->id}")
            ->assertOk();

        $entries = DocumentAuditLog::where('action', 'APPOINTMENT_FULL_AADHAAR_VIEWED')->get();

        $this->assertCount(1, $entries);
        $this->assertSame('8793', $entries->first()->metadata['aadhaar_last4']);
        $this->assertSame('RECORD_ACCESS', $entries->first()->metadata['basis']);
        $this->assertStringNotContainsString('123456788793', json_encode($entries->toArray()));
    }

    public function test_a_refused_details_request_records_no_disclosure(): void
    {
        $appointment = $this->makeAppointment('123456788793', 'nidhi-impex');

        $this->withToken(auth('api')->login($this->makeUser(1, 'silver-star')))
            ->getJson("/api/v1/appointments/{$appointment->id}");

        $this->assertSame(
            0,
            DocumentAuditLog::where('action', 'APPOINTMENT_FULL_AADHAAR_VIEWED')->count(),
        );
    }

    /**
     * The list now carries the full number, which is the largest change here: one
     * request returns every Aadhaar in the caller's scope rather than one.
     */
    public function test_the_list_endpoint_carries_the_full_number_for_in_scope_rows(): void
    {
        $this->makeAppointment();

        $response = $this->withToken(auth('api')->login($this->makeUser(0)))
            ->getJson('/api/appointment');

        $response->assertOk()
            ->assertJsonPath('data.appointments.0.aadhaar_full', '123456788793');

        // The raw column is still never serialised.
        $this->assertStringNotContainsString('aadhar_card_no', $response->getContent());
    }

    public function test_the_list_excludes_other_companies_entirely(): void
    {
        $this->makeAppointment('123456788793', 'nidhi-impex');
        $outsider = $this->makeUser(1, 'silver-star');

        $response = $this->withToken(auth('api')->login($outsider))
            ->getJson('/api/appointment');

        $response->assertOk();
        // Scope is enforced in the query, so the row is never present to disclose.
        $this->assertStringNotContainsString('123456788793', $response->getContent());
    }

    public function test_bulk_list_disclosure_is_audited_with_a_count_and_no_values(): void
    {
        $this->makeAppointment('123456788793');
        $this->makeAppointment('999988887777');

        $this->withToken(auth('api')->login($this->makeUser(0)))
            ->getJson('/api/appointment')
            ->assertOk();

        $entry = DocumentAuditLog::where('action', 'APPOINTMENT_LIST_FULL_AADHAAR_DISCLOSED')
            ->latest('id')
            ->first();

        $this->assertNotNull($entry);
        $this->assertSame(2, $entry->metadata['disclosed_count']);

        // One entry per request, not per row — a 500-row page must not produce 500
        // inserts, or the trail becomes unusable and someone switches it off.
        $this->assertSame(
            1,
            DocumentAuditLog::where('action', 'APPOINTMENT_LIST_FULL_AADHAAR_DISCLOSED')->count(),
        );

        $logged = json_encode($entry->toArray());
        $this->assertStringNotContainsString('123456788793', $logged);
        $this->assertStringNotContainsString('999988887777', $logged);
    }

    public function test_a_list_with_nothing_to_disclose_records_nothing(): void
    {
        $this->makeAppointment('');

        $this->withToken(auth('api')->login($this->makeUser(0)))
            ->getJson('/api/appointment')
            ->assertOk();

        $this->assertSame(
            0,
            DocumentAuditLog::where('action', 'APPOINTMENT_LIST_FULL_AADHAAR_DISCLOSED')->count(),
        );
    }
}
