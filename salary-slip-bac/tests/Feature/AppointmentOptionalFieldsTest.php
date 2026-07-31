<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Every field on the appointment form is optional.
 *
 * An appointment records that somebody turned up; the personnel detail is filled
 * in through Edit as it arrives. So a submission carrying almost nothing must
 * save, and a blank field must land as NULL rather than as the string "null", an
 * empty string in a UNIQUE column, or a validation error.
 *
 * Format rules are deliberately still enforced on fields that *do* have a value —
 * blank is a valid answer, "12345" as a phone number is not.
 */
class AppointmentOptionalFieldsTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function admin(int $role = 0, string $company = 'nidhi-impex'): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Admin {$n}", 'email' => "opt-admin-{$n}@test.local",
            'password' => 'x', 'role' => $role, 'company_code' => $company,
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    /** POST /appointment — what the modal actually submits. */
    private function submit(?User $actor, array $payload = [])
    {
        $request = $actor ? $this->withToken(auth('api')->login($actor)) : $this;

        return $request->post('/api/appointment', $payload);
    }

    /** POST /v1/appointments — the save-first API. */
    private function createV1(User $actor, array $payload = [])
    {
        return $this->withToken(auth('api')->login($actor))
            ->postJson('/api/v1/appointments', $payload);
    }

    private function appointments()
    {
        return User::where('type', 'appointment')->get();
    }

    // ------------------------------------------------------- save with nothing

    public function test_an_appointment_saves_with_every_field_blank(): void
    {
        $admin = $this->admin();

        $this->submit($admin, [])->assertOk();

        $this->assertCount(1, $this->appointments());
    }

    public function test_the_v1_endpoint_also_accepts_a_completely_blank_payload(): void
    {
        $admin = $this->admin();

        $this->createV1($admin, [])->assertStatus(201);

        $this->assertCount(1, $this->appointments());
    }

    public function test_blank_fields_are_stored_as_null_not_as_text(): void
    {
        $admin = $this->admin();

        $this->submit($admin, ['name' => '', 'department' => '', 'designation' => ''])->assertOk();

        $row = $this->appointments()->first();

        foreach (['department', 'designation', 'pan_card_no', 'bank_name'] as $field) {
            $this->assertNotSame('null', $row->getRawOriginal($field), "{$field} stored the string 'null'");
            $this->assertNotSame('undefined', $row->getRawOriginal($field));
            $this->assertTrue(
                $row->getRawOriginal($field) === null || $row->getRawOriginal($field) === '',
                "{$field} should be NULL or empty"
            );
        }
    }

    /**
     * The constraint that actually bites. users.email is UNIQUE, so a second
     * appointment saved with a blank email would be rejected at the database if
     * the blank were stored as '' instead of NULL.
     */
    public function test_two_appointments_can_both_have_no_email(): void
    {
        $admin = $this->admin();

        $this->submit($admin, ['name' => 'First Person'])->assertOk();
        $this->submit($admin, ['name' => 'Second Person'])->assertOk();

        $this->assertCount(2, $this->appointments());
        $this->assertNull($this->appointments()->first()->email);
    }

    public function test_two_v1_appointments_can_both_have_no_email(): void
    {
        $admin = $this->admin();

        $this->createV1($admin, ['name' => 'First'])->assertStatus(201);
        $this->createV1($admin, ['name' => 'Second'])->assertStatus(201);

        $this->assertCount(2, $this->appointments());
    }

    // ------------------------------------------------------ partial submissions

    public function test_a_partial_submission_saves_what_was_given(): void
    {
        $admin = $this->admin();

        $this->submit($admin, ['name' => 'Parth Patel', 'mobile_number' => '9876543210'])->assertOk();

        $row = $this->appointments()->first();
        $this->assertSame('Parth Patel', $row->name);
        $this->assertSame('9876543210', $row->mobile_number);
        $this->assertNull($row->pan_card_no);
    }

    public function test_a_blank_aadhaar_no_longer_blocks_the_save(): void
    {
        $admin = $this->admin();

        $this->createV1($admin, ['name' => 'No Aadhaar'])->assertStatus(201);

        $this->assertNull($this->appointments()->first()->getRawOriginal('aadhar_card_no'));
    }

    // ------------------------------------------- format rules still apply to values

    public function test_a_malformed_value_is_still_refused(): void
    {
        $admin = $this->admin();

        $this->createV1($admin, ['mobile_number' => '12345'])->assertStatus(422);
        $this->createV1($admin, ['pan_card_no' => 'ABC'])->assertStatus(422);
        $this->createV1($admin, ['email' => 'not-an-email'])->assertStatus(422);

        $this->assertCount(0, $this->appointments());
    }

    public function test_a_blank_value_is_not_treated_as_malformed(): void
    {
        $admin = $this->admin();

        // The same fields, empty rather than wrong.
        $this->createV1($admin, [
            'mobile_number' => '',
            'pan_card_no' => '',
            'email' => '',
            'bank_ifsc_code' => '',
            'bank_account_no' => '',
            'aadhar_card_no' => '',
        ])->assertStatus(201);

        $this->assertCount(1, $this->appointments());
    }

    // ------------------------------------------------ the record stays reachable

    /**
     * Company is optional on the form, but a record filed under no company is
     * matched by no company-scoped list query — it would save and then be
     * invisible on the page that just created it.
     */
    public function test_a_blank_company_falls_back_to_the_creator(): void
    {
        $admin = $this->admin(0, 'nidhi-impex');

        $this->createV1($admin, ['name' => 'No Company'])->assertStatus(201);
        $this->submit($admin, ['name' => 'No Company Two'])->assertOk();

        foreach ($this->appointments() as $row) {
            $this->assertSame('nidhi-impex', $row->company_code);
        }
    }

    public function test_an_appointment_saved_blank_still_appears_in_the_list(): void
    {
        $admin = $this->admin();

        $this->submit($admin, [])->assertOk();

        $response = $this->withToken(auth('api')->login($admin))
            ->getJson('/api/appointment?company_code=nidhi-impex,silver-star');

        $response->assertOk();
        $this->assertCount(1, $response->json('data.appointments'));
    }

    // ---------------------------------------------------------------- editing

    public function test_an_existing_appointment_can_be_edited_to_blank_out_a_field(): void
    {
        $admin = $this->admin();
        $this->createV1($admin, ['name' => 'Original', 'department' => 'Production'])->assertStatus(201);
        $id = $this->appointments()->first()->id;

        $this->withToken(auth('api')->login($admin))
            ->putJson("/api/v1/appointments/{$id}", ['department' => ''])
            ->assertOk();

        $this->assertNull(User::find($id)->department);
        // Untouched fields survive.
        $this->assertSame('Original', User::find($id)->name);
    }

    public function test_editing_with_an_entirely_blank_payload_is_accepted(): void
    {
        $admin = $this->admin();
        $this->createV1($admin, ['name' => 'Keep Me'])->assertStatus(201);
        $id = $this->appointments()->first()->id;

        $this->withToken(auth('api')->login($admin))
            ->putJson("/api/v1/appointments/{$id}", [])
            ->assertOk();

        $this->assertSame('Keep Me', User::find($id)->name);
    }

    /**
     * The details endpoint feeds the edit form and the print/PDF view. A blank
     * record must come back cleanly rather than as a 500 or a payload full of
     * nulls the client then renders as "undefined".
     */
    public function test_a_blank_appointment_can_be_viewed(): void
    {
        $admin = $this->admin();
        $this->submit($admin, [])->assertOk();
        $id = $this->appointments()->first()->id;

        $response = $this->withToken(auth('api')->login($admin))
            ->getJson("/api/v1/appointments/{$id}");

        $response->assertOk();
        $this->assertStringNotContainsString('"undefined"', $response->getContent());
        $this->assertStringNotContainsString('"NaN"', $response->getContent());
    }

    public function test_creating_a_blank_appointment_is_still_audited(): void
    {
        $admin = $this->admin();

        $this->createV1($admin, [])->assertStatus(201);

        $this->assertDatabaseHas('document_audit_logs', ['action' => 'APPOINTMENT_CREATED']);
    }
}
