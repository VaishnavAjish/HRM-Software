<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimEnrollment;
use App\Models\Mediclaim\MediclaimFloaterOverride;
use App\Models\Mediclaim\MediclaimPolicy;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\ReportingRelationship;
use App\Models\User;
use App\Services\Mediclaim\ClaimWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * PolicyEligibilityService::assertWithinFloater() (invoked from
 * ClaimWorkflowService::directorFinalApproval()): cumulative APPROVED
 * claims against the same enrollment cannot exceed the policy's
 * floater_limit_amount rule (₹3,00,000 per the seeded policy) without an
 * authorized MediclaimFloaterOverride row.
 *
 * Uses ClaimWorkflowService directly (rather than the full HTTP review
 * chain, already covered by MediclaimClaimWorkflowTransitionsTest) since
 * this file's focus is the floater arithmetic itself.
 */
class MediclaimFloaterCalculationTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function cumulative_approved_claims_cannot_exceed_the_floater_limit_without_an_override(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $reviewer = $this->makeUser('Reviewer', ['role' => 1]);
        $director = $this->makeUser('Director', ['role' => 1]);
        $this->reportsTo($employee, $manager);
        $enrollment = $this->enrolledEmployee($employee, 300000);

        $workflow = app(ClaimWorkflowService::class);

        $claim1 = $this->walkToDirectorStage($employee, $manager, $reviewer, $workflow, 250000.0);
        $decided1 = $workflow->directorFinalApproval($claim1, $director, 'approved', 250000.0);
        $this->assertSame(MediclaimClaim::STATUS_SETTLEMENT_PENDING, $decided1->status);
        $this->assertSame('250000.00', (string) $decided1->total_approved_amount);

        $claim2 = $this->walkToDirectorStage($employee, $manager, $reviewer, $workflow, 100000.0);

        $this->expectException(ValidationException::class);
        $workflow->directorFinalApproval($claim2, $director, 'approved', 100000.0);
    }

    #[Test]
    public function an_authorized_override_permits_exceeding_the_floater_and_is_audited(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $reviewer = $this->makeUser('Reviewer', ['role' => 1]);
        $director = $this->makeUser('Director', ['role' => 1]);
        $this->reportsTo($employee, $manager);
        $enrollment = $this->enrolledEmployee($employee, 300000);

        $workflow = app(ClaimWorkflowService::class);

        $claim1 = $this->walkToDirectorStage($employee, $manager, $reviewer, $workflow, 250000.0);
        $workflow->directorFinalApproval($claim1, $director, 'approved', 250000.0);

        $claim2 = $this->walkToDirectorStage($employee, $manager, $reviewer, $workflow, 100000.0);

        $override = new MediclaimFloaterOverride([
            'override_amount' => 100000,
            'reason' => 'Committee-approved exception for a critical, life-threatening treatment.',
        ]);

        $decided2 = $workflow->directorFinalApproval($claim2, $director, 'approved', 100000.0, null, $override);

        $this->assertSame(MediclaimClaim::STATUS_SETTLEMENT_PENDING, $decided2->status);
        $this->assertSame('100000.00', (string) $decided2->total_approved_amount);

        $this->assertDatabaseHas('mediclaim_floater_overrides', [
            'claim_id' => $claim2->id,
            'enrollment_id' => $enrollment->id,
            'approved_by' => $director->id,
        ]);
        $persisted = MediclaimFloaterOverride::where('claim_id', $claim2->id)->firstOrFail();
        $this->assertSame('100000.00', (string) $persisted->override_amount);
        $this->assertNotNull($persisted->approved_at);
        $this->assertNotEmpty($persisted->reason);
    }

    private function walkToDirectorStage(User $employee, User $manager, User $reviewer, ClaimWorkflowService $workflow, float $claimedAmount): MediclaimClaim
    {
        $claim = $workflow->submit($workflow->createDraft($employee, [
            'expenses' => [['category' => 'consultation', 'claimed_amount' => $claimedAmount]],
        ]), $employee);
        $workflow->acknowledgeConfidentiality($claim, $manager);
        $claim = $workflow->managerDecision($claim->fresh(), $manager, 'approve');
        $claim = $workflow->coordinatorVerify($claim->fresh(), $reviewer, 'verified');
        $claim = $workflow->committeeRecommend($claim->fresh(), $reviewer, 'recommended');
        $claim = $workflow->hrVerifyEligibility($claim->fresh(), $reviewer, 'verified');

        return $claim->fresh();
    }

    private function reportsTo(User $employee, User $manager): void
    {
        ReportingRelationship::create([
            'employee_user_id' => $employee->id,
            'manager_user_id' => $manager->id,
            'relationship_type' => ReportingRelationship::TYPE_PRIMARY,
            'status' => ReportingRelationship::STATUS_ACTIVE,
            'effective_from' => now()->subDay()->toDateString(),
            'effective_to' => null,
        ]);
    }

    private function enrolledEmployee(User $employee, int $floaterLimit): MediclaimEnrollment
    {
        $policy = MediclaimPolicy::create([
            'company_code' => 'nidhi-impex', 'policy_code' => 'POL-FLT-' . self::$sequence,
            'name' => 'Nidhi Impex Mediclaim', 'status' => 'active',
        ]);
        $version = MediclaimPolicyVersion::create([
            'policy_id' => $policy->id, 'version_number' => 1, 'status' => 'active',
            'rules' => ['floater_limit_amount' => $floaterLimit, 'intimation_required_for_planned' => true],
            'effective_from' => '2020-01-01', 'effective_to' => null,
        ]);

        return MediclaimEnrollment::create([
            'policy_version_id' => $version->id, 'employee_user_id' => $employee->id,
            'company_code' => 'nidhi-impex', 'status' => 'active', 'enrolled_at' => '2020-01-01',
        ]);
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-floater-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCF{$number}",
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'unit' => 'Surat',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }
}
