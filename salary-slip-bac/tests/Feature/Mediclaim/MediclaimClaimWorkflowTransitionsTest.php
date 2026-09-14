<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimReviewerAssignment;
use App\Models\Permission;
use App\Models\ReportingRelationship;
use App\Models\User;
use App\Services\Mediclaim\ClaimWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * One test per legal transition through the full chain (submit -> manager
 * approve -> coordinator verify -> committee recommend -> hr verify ->
 * director approve -> settlement -> closed), plus illegal-transition guards.
 *
 * closeClaim() has no HTTP route wired in routes/mediclaim.php as of this
 * snapshot (only createDraft/updateDraft/submit/managerDecision/
 * coordinatorVerify/committeeRecommend/hrVerifyEligibility/
 * directorFinalApproval/recordSettlement are reachable over HTTP) — that
 * assertion exercises ClaimWorkflowService::closeClaim() directly. The
 * illegal-transition assertions also call the service directly where the
 * controller's own scopeDecidableBy()/scopeVisibleTo() gate would otherwise
 * 404 before ever reaching the service's own status guard — this is
 * deliberate: it verifies ClaimWorkflowService's own defense-in-depth
 * "re-check status before mutating" discipline, not just the HTTP-layer gate.
 */
class MediclaimClaimWorkflowTransitionsTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function submit_transitions_draft_to_manager_review(): void
    {
        $actors = $this->makeActors();

        $created = $this->actingAsUser($actors['employee'])
            ->postJson('/api/v1/mediclaim/me/claims', [
                'expenses' => [['category' => 'consultation', 'claimed_amount' => 5000]],
            ])->assertCreated()->json('data');

        $this->actingAsUser($actors['employee'])
            ->postJson("/api/v1/mediclaim/claims/{$created['id']}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'MANAGER_REVIEW')
            ->assertJsonPath('data.total_claimed_amount', '5000.00');
    }

    #[Test]
    public function manager_approval_transitions_to_coordinator_verification(): void
    {
        $actors = $this->makeActors();
        $claimId = $this->submitClaim($actors);

        $this->actingAsUser($actors['manager'])
            ->postJson("/api/v1/mediclaim/claims/{$claimId}/confidentiality-ack")
            ->assertOk();

        $this->actingAsUser($actors['manager'])
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", ['decision' => 'approve'])
            ->assertOk()
            ->assertJsonPath('data.status', 'COORDINATOR_VERIFICATION');
    }

    #[Test]
    public function coordinator_verification_transitions_to_committee_recommendation(): void
    {
        $actors = $this->makeActors();
        $claimId = $this->advanceToCoordinatorVerification($actors);

        $this->actingAsUser($actors['coordinator'])
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", ['decision' => 'verified'])
            ->assertOk()
            ->assertJsonPath('data.status', 'COMMITTEE_RECOMMENDATION');

        $this->assertDatabaseHas('mediclaim_claim_decisions', [
            'claim_id' => $claimId,
            'stage' => 'COORDINATOR_VERIFICATION',
            'decision' => 'verified',
        ]);
    }

    #[Test]
    public function committee_recommendation_transitions_to_hr_eligibility_verification(): void
    {
        $actors = $this->makeActors();
        $claimId = $this->advanceToCommitteeRecommendation($actors);

        $this->actingAsUser($actors['committee'])
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", ['decision' => 'recommended'])
            ->assertOk()
            ->assertJsonPath('data.status', 'HR_ELIGIBILITY_VERIFICATION');
    }

    #[Test]
    public function hr_eligibility_verification_transitions_to_director_final_approval(): void
    {
        $actors = $this->makeActors();
        $claimId = $this->advanceToHrEligibilityVerification($actors);

        $this->actingAsUser($actors['hr'])
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", ['decision' => 'verified'])
            ->assertOk()
            ->assertJsonPath('data.status', 'DIRECTOR_FINAL_APPROVAL');

        $this->assertDatabaseHas('mediclaim_claim_decisions', [
            'claim_id' => $claimId,
            'stage' => 'HR_ELIGIBILITY_VERIFICATION',
            'decision' => 'verified',
        ]);
    }

    #[Test]
    public function director_approval_transitions_to_settlement_pending(): void
    {
        $actors = $this->makeActors();
        $claimId = $this->advanceToDirectorFinalApproval($actors);

        $this->actingAsUser($actors['director'])
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", [
                'decision' => 'approved',
                'approved_amount' => 5000,
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'SETTLEMENT_PENDING')
            ->assertJsonPath('data.total_approved_amount', '5000.00');
    }

    #[Test]
    public function a_settlement_covering_the_full_approved_amount_transitions_to_settled(): void
    {
        $actors = $this->makeActors();
        $claimId = $this->advanceToSettlementPending($actors, 5000.0);

        $this->actingAsUser($actors['settlementActor'])
            ->postJson('/api/v1/mediclaim/settlements', [
                'claim_id' => $claimId,
                'amount' => 5000,
                'mode' => 'bank_transfer',
                'reference' => 'UTR123456',
            ])->assertCreated();

        $this->assertSame(MediclaimClaim::STATUS_SETTLED, MediclaimClaim::findOrFail($claimId)->status);
        $this->assertNotNull(MediclaimClaim::findOrFail($claimId)->settled_at);
    }

    #[Test]
    public function closing_a_settled_claim_transitions_to_closed(): void
    {
        $actors = $this->makeActors();
        $claimId = $this->advanceToSettlementPending($actors, 5000.0);

        $workflow = app(ClaimWorkflowService::class);
        $claim = MediclaimClaim::findOrFail($claimId);
        $claim = $workflow->recordSettlement($claim, $actors['settlementActor'], 5000.0, 'bank_transfer', 'UTR000001');
        $this->assertSame(MediclaimClaim::STATUS_SETTLED, $claim->status);

        $closed = $workflow->closeClaim($claim, $actors['settlementActor']);

        $this->assertSame(MediclaimClaim::STATUS_CLOSED, $closed->status);
        $this->assertNotNull($closed->closed_at);
    }

    // ---------------------------------------------------------- illegal transitions

    #[Test]
    public function coordinator_cannot_verify_a_draft_claim(): void
    {
        $actors = $this->makeActors();
        $draft = MediclaimClaim::create([
            'company_code' => 'nidhi-impex',
            'employee_user_id' => $actors['employee']->id,
            'status' => MediclaimClaim::STATUS_DRAFT,
        ]);

        $this->expectException(ValidationException::class);
        app(ClaimWorkflowService::class)->coordinatorVerify($draft, $actors['coordinator'], 'verified');
    }

    #[Test]
    public function an_already_settled_claim_cannot_be_submitted_again(): void
    {
        $actors = $this->makeActors();
        $claimId = $this->advanceToSettlementPending($actors, 5000.0);
        $workflow = app(ClaimWorkflowService::class);
        $workflow->recordSettlement(MediclaimClaim::findOrFail($claimId), $actors['settlementActor'], 5000.0, 'bank_transfer', 'UTR000002');
        $this->assertSame(MediclaimClaim::STATUS_SETTLED, MediclaimClaim::findOrFail($claimId)->status);

        $this->actingAsUser($actors['employee'])
            ->postJson("/api/v1/mediclaim/claims/{$claimId}/submit")
            ->assertStatus(422)
            ->assertJsonValidationErrors(['status']);
    }

    #[Test]
    public function a_manager_cannot_decide_the_same_claim_twice(): void
    {
        $actors = $this->makeActors();
        $claimId = $this->submitClaim($actors);
        $workflow = app(ClaimWorkflowService::class);
        $claim = MediclaimClaim::findOrFail($claimId);

        $workflow->acknowledgeConfidentiality($claim, $actors['manager']);
        $decided = $workflow->managerDecision($claim->fresh(), $actors['manager'], 'approve');
        $this->assertSame(MediclaimClaim::STATUS_COORDINATOR_VERIFICATION, $decided->status);

        $this->expectException(ValidationException::class);
        $workflow->managerDecision($decided->fresh(), $actors['manager'], 'approve');
    }

    #[Test]
    public function the_director_cannot_approve_before_hr_eligibility_verification(): void
    {
        $actors = $this->makeActors();
        $claimId = $this->advanceToCoordinatorVerification($actors);
        $claim = MediclaimClaim::findOrFail($claimId);
        $this->assertSame(MediclaimClaim::STATUS_COORDINATOR_VERIFICATION, $claim->status);

        $this->expectException(ValidationException::class);
        app(ClaimWorkflowService::class)->directorFinalApproval($claim, $actors['director'], 'approved', 5000.0);
    }

    // ---------------------------------------------------------- helpers

    private function submitClaim(array $actors): int
    {
        $created = $this->actingAsUser($actors['employee'])
            ->postJson('/api/v1/mediclaim/me/claims', [
                'expenses' => [['category' => 'consultation', 'claimed_amount' => 5000]],
            ])->assertCreated()->json('data');

        $submitted = $this->actingAsUser($actors['employee'])
            ->postJson("/api/v1/mediclaim/claims/{$created['id']}/submit")
            ->assertOk()->json('data');

        return $submitted['id'];
    }

    private function advanceToCoordinatorVerification(array $actors): int
    {
        $claimId = $this->submitClaim($actors);
        $this->actingAsUser($actors['manager'])->postJson("/api/v1/mediclaim/claims/{$claimId}/confidentiality-ack")->assertOk();
        $this->actingAsUser($actors['manager'])
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", ['decision' => 'approve'])
            ->assertOk()->assertJsonPath('data.status', 'COORDINATOR_VERIFICATION');

        return $claimId;
    }

    private function advanceToCommitteeRecommendation(array $actors): int
    {
        $claimId = $this->advanceToCoordinatorVerification($actors);
        $this->actingAsUser($actors['coordinator'])
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", ['decision' => 'verified'])
            ->assertOk()->assertJsonPath('data.status', 'COMMITTEE_RECOMMENDATION');

        return $claimId;
    }

    private function advanceToHrEligibilityVerification(array $actors): int
    {
        $claimId = $this->advanceToCommitteeRecommendation($actors);
        $this->actingAsUser($actors['committee'])
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", ['decision' => 'recommended'])
            ->assertOk()->assertJsonPath('data.status', 'HR_ELIGIBILITY_VERIFICATION');

        return $claimId;
    }

    private function advanceToDirectorFinalApproval(array $actors): int
    {
        $claimId = $this->advanceToHrEligibilityVerification($actors);
        $this->actingAsUser($actors['hr'])
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", ['decision' => 'verified'])
            ->assertOk()->assertJsonPath('data.status', 'DIRECTOR_FINAL_APPROVAL');

        return $claimId;
    }

    private function advanceToSettlementPending(array $actors, float $approvedAmount): int
    {
        $claimId = $this->advanceToDirectorFinalApproval($actors);
        $this->actingAsUser($actors['director'])
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", [
                'decision' => 'approved',
                'approved_amount' => $approvedAmount,
            ])->assertOk()->assertJsonPath('data.status', 'SETTLEMENT_PENDING');

        return $claimId;
    }

    /** @return array<string,User> */
    private function makeActors(): array
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $coordinator = $this->makeUser('Coordinator', ['role' => 1]);
        $committee = $this->makeUser('Committee', ['role' => 1]);
        $hr = $this->makeUser('HR Verifier', ['role' => 1]);
        $director = $this->makeUser('Director', ['role' => 1]);
        $settlementActor = $this->makeUser('Settlement Actor', ['role' => 1]);

        ReportingRelationship::create([
            'employee_user_id' => $employee->id,
            'manager_user_id' => $manager->id,
            'relationship_type' => ReportingRelationship::TYPE_PRIMARY,
            'status' => ReportingRelationship::STATUS_ACTIVE,
            'effective_from' => now()->subDay()->toDateString(),
            'effective_to' => null,
        ]);

        foreach ([
            ['coordinator', $coordinator],
            ['committee', $committee],
            ['hr_verification', $hr],
            ['director', $director],
        ] as [$role, $user]) {
            MediclaimReviewerAssignment::create([
                'company_code' => 'nidhi-impex',
                'policy_id' => null,
                'role' => $role,
                'user_id' => $user->id,
                'is_backup' => false,
                'active_from' => null,
                'active_to' => null,
                'status' => 'active',
            ]);
        }

        $this->grant($employee, ['self.mediclaim.claim.create', 'self.mediclaim.claim.read', 'self.mediclaim.claim.submit']);
        $this->grant($manager, ['mediclaim.claim.manager.decide']);
        $this->grant($coordinator, ['mediclaim.claim.coordinator.decide']);
        $this->grant($committee, ['mediclaim.claim.committee.decide']);
        $this->grant($hr, ['mediclaim.claim.hr_verification.decide']);
        $this->grant($director, ['mediclaim.claim.director.decide']);
        $this->grant($settlementActor, ['mediclaim.settlement.create', 'mediclaim.settlement.read']);

        return compact('employee', 'manager', 'coordinator', 'committee', 'hr', 'director', 'settlementActor');
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-transitions-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCT{$number}",
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
