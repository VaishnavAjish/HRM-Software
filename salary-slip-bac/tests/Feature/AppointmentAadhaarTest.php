<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Documents\DocumentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Aadhaar persistence across the appointment create/update path.
 *
 * users.aadhar_card_no is hidden from every API response, so an edit form has
 * nothing to repopulate the input with and posts it back blank. Before the
 * guard in UserController::withSafeAadhaar() that blank overwrote the stored
 * number — which also silently detached the record from its S3 document folder,
 * because the folder reference is derived from the Aadhaar.
 */
class AppointmentAadhaarTest extends TestCase
{
    use RefreshDatabase;

    private function actingAdmin(): string
    {
        $admin = User::firstOrCreate(
            ['email' => 'aadhaar-admin@test.local'],
            ['name' => 'Aadhaar Admin', 'password' => 'x', 'role' => 0,
                'company_code' => 'nidhi-impex', 'status' => 0]
        );

        return auth('api')->login($admin);
    }

    private function makeAppointment(string $aadhaar = '123456789012'): User
    {
        $appointment = User::create([
            'name' => 'Rohit Saket', 'email' => 'aadhaar-appt@test.local', 'password' => 'x',
            'role' => 3, 'type' => 'appointment', 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);

        $appointment->forceFill(['aadhar_card_no' => $aadhaar])->save();

        return $appointment;
    }

    /** The stored value, bypassing the hidden-attribute rules. */
    private function storedAadhaar(User $user): ?string
    {
        return $user->fresh()->getRawOriginal('aadhar_card_no');
    }

    public function test_update_without_aadhaar_preserves_the_stored_number(): void
    {
        $token = $this->actingAdmin();
        $appointment = $this->makeAppointment();

        $this->withToken($token)
            ->postJson('/api/appointment/update', [
                'id' => $appointment->id,
                'name' => 'Rohit Kumar Saket',
            ])
            ->assertOk();

        $this->assertSame('123456789012', $this->storedAadhaar($appointment));
        $this->assertSame('Rohit Kumar Saket', $appointment->fresh()->name);
    }

    public function test_update_with_an_empty_aadhaar_does_not_erase_it(): void
    {
        $token = $this->actingAdmin();
        $appointment = $this->makeAppointment();

        // Exactly what the edit form posts when the input is left blank.
        $this->withToken($token)
            ->postJson('/api/appointment/update', [
                'id' => $appointment->id,
                'aadhar_card_no' => '',
            ])
            ->assertOk();

        $this->assertSame('123456789012', $this->storedAadhaar($appointment));
    }

    public function test_a_masked_value_is_never_accepted_as_a_replacement(): void
    {
        $token = $this->actingAdmin();
        $appointment = $this->makeAppointment();

        $this->withToken($token)
            ->postJson('/api/appointment/update', [
                'id' => $appointment->id,
                'aadhar_card_no' => 'XXXX XXXX 9012',
            ])
            ->assertOk();

        // Normalising the mask yields "9012"; storing that would corrupt the
        // record and change its document folder.
        $this->assertSame('123456789012', $this->storedAadhaar($appointment));
    }

    public function test_a_partial_number_is_rejected_rather_than_stored(): void
    {
        $token = $this->actingAdmin();
        $appointment = $this->makeAppointment();

        $this->withToken($token)
            ->postJson('/api/appointment/update', [
                'id' => $appointment->id,
                'aadhar_card_no' => '12345',
            ])
            ->assertOk();

        $this->assertSame('123456789012', $this->storedAadhaar($appointment));
    }

    public function test_update_stores_a_complete_replacement(): void
    {
        $token = $this->actingAdmin();
        $appointment = $this->makeAppointment();

        $this->withToken($token)
            ->postJson('/api/appointment/update', [
                'id' => $appointment->id,
                'aadhar_card_no' => '999988887777',
            ])
            ->assertOk();

        $this->assertSame('999988887777', $this->storedAadhaar($appointment));
    }

    public function test_formatted_input_is_normalised_to_digits(): void
    {
        $token = $this->actingAdmin();
        $appointment = $this->makeAppointment();

        $this->withToken($token)
            ->postJson('/api/appointment/update', [
                'id' => $appointment->id,
                'aadhar_card_no' => '9999 8888 7777',
            ])
            ->assertOk();

        // Digits only, or the same person would resolve to two S3 folders.
        $this->assertSame('999988887777', $this->storedAadhaar($appointment));
    }

    public function test_the_response_masks_the_number_and_never_returns_it(): void
    {
        $token = $this->actingAdmin();
        $appointment = $this->makeAppointment();

        $response = $this->withToken($token)
            ->postJson('/api/appointment/update', [
                'id' => $appointment->id,
                'name' => 'Rohit Saket',
            ])
            ->assertOk();

        $response->assertJsonPath('user.aadhaar_masked', 'XXXX XXXX 9012');
        $response->assertJsonMissingPath('user.aadhar_card_no');
        $this->assertStringNotContainsString('123456789012', $response->getContent());
    }

    public function test_an_appointment_without_an_aadhaar_masks_to_an_empty_string(): void
    {
        $appointment = $this->makeAppointment('');

        $this->assertSame('', $appointment->fresh()->aadhaar_masked);
    }

    public function test_the_document_folder_reference_comes_from_the_stored_number(): void
    {
        config(['documents.mask_aadhaar_in_key' => false]);

        $appointment = $this->makeAppointment();

        // Read from the database record, never from request input.
        $this->assertSame(
            '123456789012',
            DocumentService::ownerFolderReference($appointment->fresh()),
        );
    }

    public function test_a_blank_stored_number_does_not_produce_an_aadhaar_folder(): void
    {
        config(['documents.mask_aadhaar_in_key' => false]);

        $appointment = $this->makeAppointment('');
        $appointment->forceFill(['emp_code' => 'EMP1025'])->save();

        $reference = DocumentService::ownerFolderReference($appointment->fresh());

        // Falls back to the employee code rather than inventing a folder.
        $this->assertSame('EMP1025', $reference);
    }

    public function test_a_preserved_aadhaar_keeps_the_same_folder_after_an_edit(): void
    {
        config(['documents.mask_aadhaar_in_key' => false]);

        $token = $this->actingAdmin();
        $appointment = $this->makeAppointment();
        $before = DocumentService::ownerFolderReference($appointment);

        $this->withToken($token)
            ->postJson('/api/appointment/update', [
                'id' => $appointment->id,
                'name' => 'Renamed Person',
                'aadhar_card_no' => '',
            ])
            ->assertOk();

        // The whole point: an edit must not move a record's documents.
        $this->assertSame($before, DocumentService::ownerFolderReference($appointment->fresh()));
    }
}
