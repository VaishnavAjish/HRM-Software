<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Document;
use App\Models\DocumentVersion;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimDocumentLink;
use App\Models\Permission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * DocumentAuthorizer::canViewViaMediclaimClaim() (the Mediclaim branch added
 * post-B6), exercised through the real, generic document endpoints Mediclaim
 * reuses unmodified (`POST /api/v1/documents/{id}/view-url` /
 * `download-url` — NOT a Mediclaim-specific route; confirmed against
 * routes/api.php's `v1/documents` group and DocumentAuthorizer.php's own
 * Mediclaim branch). Also confirms DocumentService::assertServable() blocks
 * serving a PENDING_SCAN or INFECTED version even to an otherwise-authorized
 * viewer (exact codes/status confirmed by reading
 * app/Services/Documents/DocumentService.php and
 * app/Exceptions/DocumentException.php directly: QUARANTINED=403,
 * PENDING_SCAN=409).
 */
class MediclaimDocumentAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    protected function setUp(): void
    {
        parent::setUp();

        // The default .env sets DOCUMENT_STORAGE_PROVIDER=s3; forcing the
        // local filesystem provider here avoids these tests depending on
        // real AWS credentials being configured in whatever environment
        // eventually runs them (view/downloadUrl() otherwise resolves
        // S3StorageProvider). The 403/409 assertions below don't reach the
        // storage provider at all (assertServable()/authorize() throw
        // first), but the "owner can view" success case does.
        config(['documents.provider' => 'local']);
    }

    #[Test]
    public function an_employee_can_view_their_own_claim_document(): void
    {
        $employee = $this->makeUser('Employee A');
        $this->grant($employee, ['document.file.read']);
        [$claim, $document] = $this->claimWithDocument($employee);

        $this->actingAsUser($employee)
            ->postJson("/api/v1/documents/{$document->id}/view-url")
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    #[Test]
    public function an_employee_cannot_view_another_employees_claim_document(): void
    {
        $employeeA = $this->makeUser('Employee A');
        $employeeB = $this->makeUser('Employee B');
        $this->grant($employeeB, ['document.file.read']);
        [$claim, $document] = $this->claimWithDocument($employeeA);

        $this->actingAsUser($employeeB)
            ->postJson("/api/v1/documents/{$document->id}/view-url")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'ACCESS_DENIED');
    }

    #[Test]
    public function a_pending_scan_document_cannot_be_served_even_to_its_owner(): void
    {
        $employee = $this->makeUser('Employee A');
        $this->grant($employee, ['document.file.read']);
        [$claim, $document] = $this->claimWithDocument($employee, DocumentVersion::SCAN_PENDING);

        $this->actingAsUser($employee)
            ->postJson("/api/v1/documents/{$document->id}/view-url")
            ->assertStatus(409)
            ->assertJsonPath('error.code', 'DOCUMENT_PENDING_SCAN');
    }

    #[Test]
    public function an_infected_document_cannot_be_served_even_to_its_owner(): void
    {
        $employee = $this->makeUser('Employee A');
        $this->grant($employee, ['document.file.read']);
        [$claim, $document] = $this->claimWithDocument($employee, DocumentVersion::SCAN_INFECTED);

        $this->actingAsUser($employee)
            ->postJson("/api/v1/documents/{$document->id}/view-url")
            ->assertStatus(403)
            ->assertJsonPath('error.code', 'DOCUMENT_QUARANTINED');
    }

    /** @return array{0:MediclaimClaim,1:Document} */
    private function claimWithDocument(User $employee, string $scanStatus = DocumentVersion::SCAN_NOT_SCANNED): array
    {
        $claim = MediclaimClaim::create([
            'company_code' => 'nidhi-impex',
            'employee_user_id' => $employee->id,
            'status' => MediclaimClaim::STATUS_DRAFT,
        ]);

        $document = Document::create([
            'owner_type' => 'user',
            'owner_id' => $employee->id,
            'owner_ref' => (string) $employee->id,
            'user_id' => $employee->id,
            'document_type' => 'DISCHARGE_SUMMARY',
            'current_version' => 1,
            'status' => Document::STATUS_ACTIVE,
            'is_deleted' => false,
        ]);

        DocumentVersion::create([
            'document_id' => $document->id,
            'version' => 1,
            'original_file_name' => 'discharge-summary.pdf',
            'generated_file_name' => 'DISCHARGE_SUMMARY_V1_20260101120000.pdf',
            's3_object_key' => "mediclaim/{$employee->id}/discharge-summary/DISCHARGE_SUMMARY_V1.pdf",
            'file_extension' => 'pdf',
            'file_size' => 2048,
            'mime_type' => 'application/pdf',
            'upload_status' => DocumentVersion::UPLOAD_ACTIVE,
            'scan_status' => $scanStatus,
            'uploaded_at' => now(),
        ]);

        MediclaimDocumentLink::create([
            'document_id' => $document->id,
            'linkable_type' => MediclaimClaim::class,
            'linkable_id' => $claim->id,
            'document_role' => 'discharge_summary',
            'created_by' => $employee->id,
        ]);

        return [$claim, $document];
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-docauth-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCDA{$number}",
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'unit' => 'Surat',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    private function grant(User $user, array $codes): void
    {
        foreach ($codes as $code) {
            $parts = explode('.', $code);
            $action = array_pop($parts);
            $permission = Permission::query()->firstOrCreate(['code' => $code], [
                'name' => $code,
                'resource' => implode('.', $parts),
                'action' => $action,
                'level' => 'ACTION',
                'is_sensitive' => str_contains($code, 'decide'),
                'is_active' => true,
            ]);
            DB::table('user_permissions')->updateOrInsert(
                ['user_id' => $user->id, 'permission_id' => $permission->id],
                ['is_denied' => false],
            );
        }
    }

    private function actingAsUser(User $user): static
    {
        return $this->withToken(auth('api')->login($user));
    }
}
