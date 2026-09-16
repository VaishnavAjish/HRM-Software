<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Document;
use App\Models\DocumentVersion;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimDocumentLink;
use App\Models\Permission;
use App\Models\ReportingRelationship;
use App\Models\User;
use App\Services\Mediclaim\ClaimWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Spot-checks that state transitions land a `mediclaim_claim_events` row
 * (MediclaimClaimEventLog::record(), called from every
 * ClaimWorkflowService transition via its private logTransition() helper);
 * that a manager's access to a claim's sensitive detail is audited (the real
 * mechanism is the CONFIDENTIALITY_ACKNOWLEDGED event written by
 * acknowledgeConfidentiality() — the moment a manager formally accesses a
 * claim's confidential medical detail); and that a document download is
 * audited (DocumentAudit::record(DOWNLOAD_URL_GENERATED, ...) inside
 * DocumentService::downloadUrl(), confirmed by reading the real source).
 */
class MediclaimAuditCompletenessTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function submitting_a_claim_writes_a_claim_submitted_event(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        ReportingRelationship::create([
            'employee_user_id' => $employee->id, 'manager_user_id' => $manager->id,
            'relationship_type' => ReportingRelationship::TYPE_PRIMARY, 'status' => ReportingRelationship::STATUS_ACTIVE,
            'effective_from' => now()->subDay()->toDateString(), 'effective_to' => null,
        ]);
        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->submit($workflow->createDraft($employee, []), $employee);

        $this->assertDatabaseHas('mediclaim_claim_events', [
            'claim_id' => $claim->id,
            'event_type' => 'CLAIM_SUBMITTED',
            'to_status' => MediclaimClaim::STATUS_MANAGER_REVIEW,
        ]);
    }

    #[Test]
    public function a_manager_decision_writes_a_manager_approve_event(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        ReportingRelationship::create([
            'employee_user_id' => $employee->id, 'manager_user_id' => $manager->id,
            'relationship_type' => ReportingRelationship::TYPE_PRIMARY, 'status' => ReportingRelationship::STATUS_ACTIVE,
            'effective_from' => now()->subDay()->toDateString(), 'effective_to' => null,
        ]);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->submit($workflow->createDraft($employee, []), $employee);
        $workflow->acknowledgeConfidentiality($claim, $manager);
        $decided = $workflow->managerDecision($claim->fresh(), $manager, 'approve');

        $this->assertDatabaseHas('mediclaim_claim_events', [
            'claim_id' => $decided->id,
            'event_type' => 'MANAGER_APPROVE',
            'from_status' => MediclaimClaim::STATUS_MANAGER_REVIEW,
            'to_status' => MediclaimClaim::STATUS_COORDINATOR_VERIFICATION,
        ]);
    }

    #[Test]
    public function a_managers_confidentiality_acknowledgement_the_gate_to_seeing_sensitive_claim_detail_is_audited(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        ReportingRelationship::create([
            'employee_user_id' => $employee->id, 'manager_user_id' => $manager->id,
            'relationship_type' => ReportingRelationship::TYPE_PRIMARY, 'status' => ReportingRelationship::STATUS_ACTIVE,
            'effective_from' => now()->subDay()->toDateString(), 'effective_to' => null,
        ]);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->submit($workflow->createDraft($employee, []), $employee);

        $this->assertDatabaseMissing('mediclaim_claim_events', ['claim_id' => $claim->id, 'event_type' => 'CONFIDENTIALITY_ACKNOWLEDGED']);

        $workflow->acknowledgeConfidentiality($claim, $manager);

        $this->assertDatabaseHas('mediclaim_claim_events', [
            'claim_id' => $claim->id,
            'event_type' => 'CONFIDENTIALITY_ACKNOWLEDGED',
            'actor_id' => $manager->id,
        ]);
    }

    #[Test]
    public function a_document_download_is_audited(): void
    {
        config(['documents.provider' => 'local']);

        $employee = $this->makeUser('Employee');
        $this->grant($employee, ['document.file.download']);

        $claim = MediclaimClaim::create([
            'company_code' => 'nidhi-impex', 'employee_user_id' => $employee->id, 'status' => MediclaimClaim::STATUS_DRAFT,
        ]);
        $document = Document::create([
            'owner_type' => 'user', 'owner_id' => $employee->id, 'owner_ref' => (string) $employee->id,
            'user_id' => $employee->id, 'document_type' => 'DISCHARGE_SUMMARY',
            'current_version' => 1, 'status' => Document::STATUS_ACTIVE, 'is_deleted' => false,
        ]);
        DocumentVersion::create([
            'document_id' => $document->id, 'version' => 1,
            'original_file_name' => 'discharge-summary.pdf', 'generated_file_name' => 'DISCHARGE_SUMMARY_V1_20260101120000.pdf',
            's3_object_key' => "mediclaim/{$employee->id}/discharge-summary/DISCHARGE_SUMMARY_V1.pdf",
            'file_extension' => 'pdf', 'file_size' => 2048, 'mime_type' => 'application/pdf',
            'upload_status' => DocumentVersion::UPLOAD_ACTIVE, 'scan_status' => DocumentVersion::SCAN_NOT_SCANNED,
            'uploaded_at' => now(),
        ]);
        MediclaimDocumentLink::create([
            'document_id' => $document->id, 'linkable_type' => MediclaimClaim::class,
            'linkable_id' => $claim->id, 'document_role' => 'discharge_summary', 'created_by' => $employee->id,
        ]);

        $this->assertDatabaseMissing('document_audit_logs', ['document_id' => $document->id, 'action' => 'DOWNLOAD_URL_GENERATED']);

        $this->actingAsUser($employee)
            ->postJson("/api/v1/documents/{$document->id}/download-url")
            ->assertOk();

        $this->assertDatabaseHas('document_audit_logs', [
            'document_id' => $document->id,
            'action' => 'DOWNLOAD_URL_GENERATED',
            'actor_user_id' => $employee->id,
        ]);
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-audit-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCAU{$number}",
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
