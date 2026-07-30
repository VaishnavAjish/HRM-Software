<?php

namespace Tests\Feature;

use App\Models\DocumentAuditLog;
use App\Models\PermissionDimension;
use App\Models\Role;
use App\Models\User;
use App\Support\AadhaarAccess;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * POST /v1/appointments/{id}/aadhaar/reveal
 *
 * The single route that returns a complete Aadhaar number. Everywhere else the
 * column is hidden and only `aadhaar_masked` is exposed, so these tests are what
 * keep that boundary from quietly eroding.
 */
class AadhaarRevealTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function makeUser(int $role, string $company = 'nidhi-impex'): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Actor {$n}", 'email' => "reveal-actor-{$n}@test.local",
            'password' => 'x', 'role' => $role, 'company_code' => $company, 'status' => 0,
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

    /** Give a non-super-admin the explicit reveal grant. */
    private function grantReveal(User $actor, string $value = 'view_only'): void
    {
        // roles.type is an enum of System|Custom — a per-user permission bucket
        // is a Custom role.
        $role = Role::create(['name' => 'User_'.$actor->id.'_Permissions', 'type' => 'Custom']);

        PermissionDimension::create([
            'dimension' => 'page',
            'role_id' => $role->id,
            'key_name' => AadhaarAccess::PERMISSION,
            'value' => $value,
        ]);
    }

    private function reveal(User $actor, User $appointment)
    {
        return $this->withToken(auth('api')->login($actor))
            ->postJson("/api/v1/appointments/{$appointment->id}/aadhaar/reveal");
    }

    public function test_a_super_admin_can_reveal_the_number(): void
    {
        $response = $this->reveal($this->makeUser(0), $this->makeAppointment());

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.aadhaarNumber', '123456788793')
            ->assertJsonPath('data.expiresIn', 30);
    }

    public function test_an_explicitly_granted_user_can_reveal_the_number(): void
    {
        $hr = $this->makeUser(1);
        $this->grantReveal($hr);

        $this->reveal($hr, $this->makeAppointment())
            ->assertOk()
            ->assertJsonPath('data.aadhaarNumber', '123456788793');
    }

    public function test_a_read_write_grant_also_allows_it(): void
    {
        $hr = $this->makeUser(1);
        $this->grantReveal($hr, 'read_write');

        $this->reveal($hr, $this->makeAppointment())->assertOk();
    }

    public function test_a_company_admin_without_the_grant_is_refused(): void
    {
        // Seniority alone must not carry this — it has to be granted.
        $this->reveal($this->makeUser(1), $this->makeAppointment())
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'APPOINTMENT_ACCESS_DENIED');
    }

    public function test_a_no_access_grant_is_refused(): void
    {
        $manager = $this->makeUser(2);
        $this->grantReveal($manager, 'no_access');

        $this->reveal($manager, $this->makeAppointment())->assertStatus(403);
    }

    public function test_the_refusal_body_never_contains_the_number(): void
    {
        $response = $this->reveal($this->makeUser(1), $this->makeAppointment());

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

    public function test_a_successful_reveal_is_audited_without_the_number(): void
    {
        $actor = $this->makeUser(0);
        $appointment = $this->makeAppointment();

        $this->reveal($actor, $appointment)->assertOk();

        $entry = DocumentAuditLog::where('action', 'APPOINTMENT_AADHAAR_REVEALED')->latest('id')->first();

        $this->assertNotNull($entry);
        $this->assertSame($actor->id, $entry->actor_user_id);
        $this->assertSame(AadhaarAccess::PERMISSION, $entry->permission);
        $this->assertSame('ALLOWED', $entry->permission_result);
        $this->assertSame($appointment->id, $entry->metadata['appointment_id']);
        $this->assertSame('8793', $entry->metadata['aadhaar_last4']);

        // The audit trail records that a reveal happened, not the number itself.
        $this->assertStringNotContainsString('123456788793', json_encode($entry->toArray()));
    }

    public function test_a_denied_reveal_is_audited(): void
    {
        $actor = $this->makeUser(1);

        $this->reveal($actor, $this->makeAppointment())->assertStatus(403);

        $entry = DocumentAuditLog::where('action', 'APPOINTMENT_AADHAAR_REVEAL_DENIED')
            ->latest('id')->first();

        $this->assertNotNull($entry);
        $this->assertSame($actor->id, $entry->actor_user_id);
        $this->assertSame('DENIED', $entry->permission_result);
        $this->assertSame(AadhaarAccess::PERMISSION, $entry->permission);
    }

    public function test_the_details_endpoint_gives_an_authorised_actor_the_full_number(): void
    {
        $appointment = $this->makeAppointment();

        $response = $this->withToken(auth('api')->login($this->makeUser(0)))
            ->getJson("/api/v1/appointments/{$appointment->id}");

        $response->assertOk()
            ->assertJsonPath('data.appointment.aadhaar_masked', 'XXXX XXXX 8793')
            ->assertJsonPath('data.appointment.aadhaar_full', '123456788793')
            // The raw column stays hidden; aadhaar_full is added explicitly.
            ->assertJsonMissingPath('data.appointment.aadhar_card_no');
    }

    public function test_the_details_endpoint_gives_an_unauthorised_actor_only_the_mask(): void
    {
        $appointment = $this->makeAppointment();

        $response = $this->withToken(auth('api')->login($this->makeUser(1)))
            ->getJson("/api/v1/appointments/{$appointment->id}");

        $response->assertOk()
            ->assertJsonPath('data.appointment.aadhaar_masked', 'XXXX XXXX 8793')
            ->assertJsonMissingPath('data.appointment.aadhaar_full')
            ->assertJsonMissingPath('data.appointment.aadhar_card_no');

        $this->assertStringNotContainsString('123456788793', $response->getContent());
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
        $this->assertStringNotContainsString('123456788793', json_encode($entries->toArray()));
    }

    public function test_an_unauthorised_view_records_no_sensitive_access_entry(): void
    {
        $appointment = $this->makeAppointment();

        $this->withToken(auth('api')->login($this->makeUser(1)))
            ->getJson("/api/v1/appointments/{$appointment->id}")
            ->assertOk();

        $this->assertSame(
            0,
            DocumentAuditLog::where('action', 'APPOINTMENT_FULL_AADHAAR_VIEWED')->count(),
        );
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

    public function test_an_unauthorised_print_recheck_is_refused(): void
    {
        $appointment = $this->makeAppointment();

        // A client asking for print context does not get to skip the check.
        $this->withToken(auth('api')->login($this->makeUser(1)))
            ->postJson("/api/v1/appointments/{$appointment->id}/aadhaar/reveal", ['context' => 'PRINT'])
            ->assertStatus(403);

        $denied = DocumentAuditLog::where('action', 'APPOINTMENT_AADHAAR_REVEAL_DENIED')->first();
        $this->assertNotNull($denied);
        $this->assertSame('PRINT', $denied->metadata['context']);
    }

    public function test_the_list_endpoint_never_carries_the_full_number(): void
    {
        $this->makeAppointment();

        $response = $this->withToken(auth('api')->login($this->makeUser(0)))
            ->getJson('/api/appointment');

        $response->assertOk();
        // Lists stay masked regardless of permission.
        $this->assertStringNotContainsString('123456788793', $response->getContent());
        $this->assertStringNotContainsString('aadhaar_full', $response->getContent());
    }
}
