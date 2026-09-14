<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
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
 * ClaimWorkflowService::recordSettlement()/closeClaim(): a settlement
 * covering the full approved amount moves the claim to SETTLED; a partial
 * settlement keeps it at SETTLEMENT_PENDING; closing only works from SETTLED.
 */
class MediclaimSettlementTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function a_settlement_covering_the_full_approved_amount_moves_the_claim_to_settled(): void
    {
        $claim = $this->approvedClaim(4000.0);
        $settler = $this->makeUser('Settler', ['role' => 1]);
        $this->grant($settler, ['mediclaim.settlement.create']);

        $this->actingAsUser($settler)
            ->postJson('/api/v1/mediclaim/settlements', ['claim_id' => $claim->id, 'amount' => 4000, 'mode' => 'bank_transfer'])
            ->assertCreated();

        $fresh = $claim->fresh();
        $this->assertSame(MediclaimClaim::STATUS_SETTLED, $fresh->status);
        $this->assertNotNull($fresh->settled_at);
    }

    #[Test]
    public function a_partial_settlement_keeps_the_claim_in_settlement_pending(): void
    {
        $claim = $this->approvedClaim(4000.0);
        $settler = $this->makeUser('Settler', ['role' => 1]);
        $this->grant($settler, ['mediclaim.settlement.create']);

        $this->actingAsUser($settler)
            ->postJson('/api/v1/mediclaim/settlements', ['claim_id' => $claim->id, 'amount' => 1500, 'mode' => 'bank_transfer'])
            ->assertCreated();

        $fresh = $claim->fresh();
        $this->assertSame(MediclaimClaim::STATUS_SETTLEMENT_PENDING, $fresh->status);
        $this->assertNull($fresh->settled_at);

        // A second, completing settlement then does move it to SETTLED.
        $this->actingAsUser($settler)
            ->postJson('/api/v1/mediclaim/settlements', ['claim_id' => $claim->id, 'amount' => 2500, 'mode' => 'bank_transfer'])
            ->assertCreated();

        $this->assertSame(MediclaimClaim::STATUS_SETTLED, $claim->fresh()->status);
        $this->assertSame(2, $claim->fresh()->settlements()->count());
    }

    #[Test]
    public function closing_only_works_from_settled(): void
    {
        $claim = $this->approvedClaim(4000.0);
        $actor = $this->makeUser('Actor', ['role' => 1]);
        $workflow = app(ClaimWorkflowService::class);

        $this->assertSame(MediclaimClaim::STATUS_SETTLEMENT_PENDING, $claim->status);
        $this->expectException(ValidationException::class);
        $workflow->closeClaim($claim, $actor);
    }

    #[Test]
    public function a_settled_claim_can_be_closed(): void
    {
        $claim = $this->approvedClaim(4000.0);
        $actor = $this->makeUser('Actor', ['role' => 1]);
        $workflow = app(ClaimWorkflowService::class);

        $settled = $workflow->recordSettlement($claim, $actor, 4000.0, 'bank_transfer');
        $this->assertSame(MediclaimClaim::STATUS_SETTLED, $settled->status);

        $closed = $workflow->closeClaim($settled, $actor);
        $this->assertSame(MediclaimClaim::STATUS_CLOSED, $closed->status);
        $this->assertNotNull($closed->closed_at);
    }

    private function approvedClaim(float $approvedAmount): MediclaimClaim
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $reviewer = $this->makeUser('Reviewer', ['role' => 1]);
        $director = $this->makeUser('Director', ['role' => 1]);

        ReportingRelationship::create([
            'employee_user_id' => $employee->id,
            'manager_user_id' => $manager->id,
            'relationship_type' => ReportingRelationship::TYPE_PRIMARY,
            'status' => ReportingRelationship::STATUS_ACTIVE,
            'effective_from' => now()->subDay()->toDateString(),
            'effective_to' => null,
        ]);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->createDraft($employee, ['expenses' => [['category' => 'consultation', 'claimed_amount' => $approvedAmount]]]);
        $claim = $workflow->submit($claim, $employee);
        $workflow->acknowledgeConfidentiality($claim, $manager);
        $claim = $workflow->managerDecision($claim->fresh(), $manager, 'approve');
        $claim = $workflow->coordinatorVerify($claim->fresh(), $reviewer, 'verified');
        $claim = $workflow->committeeRecommend($claim->fresh(), $reviewer, 'recommended');
        $claim = $workflow->hrVerifyEligibility($claim->fresh(), $reviewer, 'verified');

        return $workflow->directorFinalApproval($claim->fresh(), $director, 'approved', $approvedAmount);
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-settlement-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCST{$number}",
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
