<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimExpense;
use App\Models\Mediclaim\MediclaimClaimRevision;
use App\Models\Permission;
use App\Models\ReportingRelationship;
use App\Models\User;
use App\Services\Mediclaim\ClaimWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Return-for-correction requires remarks; resubmission creates a new
 * MediclaimClaimRevision row (append-only, never deletes the original
 * expense rows); earlier MediclaimClaimDecision rows stay readable via
 * /claims/{claim}/decisions after a resubmission.
 */
class MediclaimReturnCorrectionResubmissionTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function returning_a_claim_for_correction_requires_remarks(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $this->reportsTo($employee, $manager);
        $this->grant($manager, ['mediclaim.claim.manager.decide']);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->submit($workflow->createDraft($employee, []), $employee);

        $this->actingAsUser($manager)
            ->postJson("/api/v1/mediclaim/claims/{$claim->id}/return", [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['remarks']);

        $this->assertSame(MediclaimClaim::STATUS_MANAGER_REVIEW, $claim->fresh()->status);
    }

    #[Test]
    public function resubmission_creates_a_revision_row_without_deleting_the_original_expenses(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $this->reportsTo($employee, $manager);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->createDraft($employee, [
            'expenses' => [
                ['category' => 'CONSULTATION_FEES', 'claimed_amount' => 1500],
                ['category' => 'MEDICINES', 'claimed_amount' => 800],
            ],
        ]);
        $originalExpenseIds = $claim->expenses()->pluck('id')->sort()->values()->all();
        $this->assertCount(2, $originalExpenseIds);

        $claim = $workflow->submit($claim, $employee);
        $workflow->acknowledgeConfidentiality($claim, $manager);
        $claim = $workflow->managerDecision($claim->fresh(), $manager, 'return', 'Please attach the discharge summary.');
        $this->assertSame(MediclaimClaim::STATUS_RETURNED_FOR_CORRECTION, $claim->status);

        $revisionsBefore = MediclaimClaimRevision::where('claim_id', $claim->id)->count();
        $this->assertSame(0, $revisionsBefore);

        $resubmitted = $workflow->submit($claim->fresh(), $employee);

        $this->assertSame(MediclaimClaim::STATUS_MANAGER_REVIEW, $resubmitted->status);
        $this->assertSame(1, MediclaimClaimRevision::where('claim_id', $claim->id)->count());

        $revision = MediclaimClaimRevision::where('claim_id', $claim->id)->firstOrFail();
        $this->assertSame(1, $revision->revision_number);
        $this->assertIsArray($revision->prior_state);
        $this->assertArrayHasKey('expenses', $revision->prior_state);
        $this->assertCount(2, $revision->prior_state['expenses']);

        // The original expense rows are still there, untouched by id.
        $stillPresentIds = MediclaimClaimExpense::where('claim_id', $claim->id)->pluck('id')->sort()->values()->all();
        $this->assertSame($originalExpenseIds, $stillPresentIds);
    }

    #[Test]
    public function earlier_decisions_remain_readable_via_the_decisions_endpoint_after_resubmission(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $this->reportsTo($employee, $manager);
        $this->grant($employee, ['self.mediclaim.claim.read']);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->submit($workflow->createDraft($employee, []), $employee);
        $workflow->acknowledgeConfidentiality($claim, $manager);
        $claim = $workflow->managerDecision($claim->fresh(), $manager, 'return', 'Missing the treating doctor name.');

        $workflow->submit($claim->fresh(), $employee);

        $this->actingAsUser($employee)
            ->getJson("/api/v1/mediclaim/claims/{$claim->id}/decisions")
            ->assertOk()
            ->assertJsonFragment(['decision' => 'returned', 'stage' => 'MANAGER_REVIEW']);
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

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-return-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCRT{$number}",
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
