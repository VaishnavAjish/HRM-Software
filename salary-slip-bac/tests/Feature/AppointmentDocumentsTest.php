<?php

namespace Tests\Feature;

use App\Models\Document;
use App\Models\DocumentVersion;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * GET /api/v1/appointments/{id}/documents
 *
 * The point of this endpoint is that it scopes by appointment, not by employee
 * or Aadhaar number — one person can hold several appointments and historical
 * records share Aadhaar values, so those broader keys mix unrelated documents.
 */
class AppointmentDocumentsTest extends TestCase
{
    // Migrations run against the in-memory sqlite DB that phpunit.xml
    // configures, so this never touches the development database.
    use RefreshDatabase;

    private function actingAdmin(): array
    {
        $admin = User::firstOrCreate(
            ['email' => 'apt-doc-admin@test.local'],
            ['name' => 'Doc Admin', 'password' => 'x', 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0]
        );

        return [$admin, auth('api')->login($admin)];
    }

    private function makeAppointment(string $email, ?string $aadhaar = '123456789012'): User
    {
        $appointment = User::firstOrCreate(
            ['email' => $email],
            ['name' => 'Appt ' . $email, 'password' => 'x', 'role' => 3, 'type' => 'appointment',
             'company_code' => 'nidhi-impex', 'status' => 0]
        );

        $appointment->forceFill(['aadhar_card_no' => $aadhaar])->save();

        return $appointment;
    }

    private function attachDocument(User $owner, string $type, bool $deleted = false): Document
    {
        $document = Document::create([
            'owner_type'      => 'appointment',
            'owner_id'        => $owner->id,
            'owner_ref'       => (string) $owner->id,
            'user_id'         => $owner->id,
            'document_type'   => $type,
            'current_version' => 1,
            'status'          => $deleted ? Document::STATUS_DELETED : Document::STATUS_ACTIVE,
            'is_deleted'      => $deleted,
        ]);

        DocumentVersion::create([
            'document_id'         => $document->id,
            'version'             => 1,
            'original_file_name'  => strtolower($type) . '.pdf',
            'generated_file_name'  => $type . '_V1_20260730120000.pdf',
            's3_object_key'       => "123456789012/{$owner->id}/{$type}/{$type}_V1.pdf",
            'file_extension'      => 'pdf',
            'file_size'           => 1024,
            'mime_type'           => 'application/pdf',
            'upload_status'       => DocumentVersion::UPLOAD_ACTIVE,
            'uploaded_at'         => now(),
        ]);

        return $document;
    }

    public function test_authorized_list_returns_only_that_appointments_documents(): void
    {
        [, $token] = $this->actingAdmin();

        // Two appointments deliberately sharing one Aadhaar number.
        $first = $this->makeAppointment('apt-doc-a@test.local');
        $second = $this->makeAppointment('apt-doc-b@test.local');

        $this->attachDocument($first, 'PAN_CARD');
        $this->attachDocument($first, 'AADHAR_CARD');
        $this->attachDocument($second, 'BANK_PASSBOOK');

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson("/api/v1/appointments/{$first->id}/documents");

        $response->assertOk()->assertJsonPath('success', true);

        $types = array_column($response->json('data.items'), 'documentType');

        sort($types);
        $this->assertSame(['AADHAR_CARD', 'PAN_CARD'], $types);

        // The other appointment's document must not leak in despite the shared
        // Aadhaar number.
        $this->assertNotContains('BANK_PASSBOOK', $types);
    }

    public function test_soft_deleted_documents_are_excluded(): void
    {
        [, $token] = $this->actingAdmin();
        $appointment = $this->makeAppointment('apt-doc-del@test.local');

        $this->attachDocument($appointment, 'PAN_CARD');
        $this->attachDocument($appointment, 'RESUME', true);

        $response = $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson("/api/v1/appointments/{$appointment->id}/documents");

        $types = array_column($response->json('data.items'), 'documentType');

        $this->assertContains('PAN_CARD', $types);
        $this->assertNotContains('RESUME', $types);
    }

    public function test_missing_appointment_returns_not_found(): void
    {
        [, $token] = $this->actingAdmin();

        $this->withHeader('Authorization', "Bearer {$token}")
            ->getJson('/api/v1/appointments/99999999/documents')
            ->assertStatus(404)
            ->assertJsonPath('error.code', 'APPOINTMENT_NOT_FOUND');
    }

    public function test_unauthenticated_request_is_rejected(): void
    {
        $appointment = $this->makeAppointment('apt-doc-anon@test.local');

        $this->getJson("/api/v1/appointments/{$appointment->id}/documents")
            ->assertStatus(401);
    }

    public function test_other_company_is_denied(): void
    {
        $appointment = $this->makeAppointment('apt-doc-other@test.local');
        $appointment->forceFill(['company_code' => 'silverstar'])->save();

        // role 1 is scoped to its own company_code.
        $outsider = User::firstOrCreate(
            ['email' => 'apt-doc-outsider@test.local'],
            ['name' => 'Outsider', 'password' => 'x', 'role' => 1, 'company_code' => 'nidhi-impex', 'status' => 0]
        );

        $this->withHeader('Authorization', 'Bearer ' . auth('api')->login($outsider))
            ->getJson("/api/v1/appointments/{$appointment->id}/documents")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'APPOINTMENT_ACCESS_DENIED');
    }

    protected function tearDown(): void
    {
        $emails = [
            'apt-doc-admin@test.local', 'apt-doc-a@test.local', 'apt-doc-b@test.local',
            'apt-doc-del@test.local', 'apt-doc-anon@test.local', 'apt-doc-other@test.local',
            'apt-doc-outsider@test.local',
        ];

        $ids = User::whereIn('email', $emails)->pluck('id');
        DocumentVersion::whereIn('document_id', Document::whereIn('user_id', $ids)->pluck('id'))->delete();
        Document::whereIn('user_id', $ids)->delete();
        User::whereIn('id', $ids)->forceDelete();

        parent::tearDown();
    }
}
