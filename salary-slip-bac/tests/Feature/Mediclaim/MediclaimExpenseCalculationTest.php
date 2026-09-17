<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimExpense;
use App\Models\Permission;
use App\Models\ReportingRelationship;
use App\Models\User;
use App\Services\Mediclaim\ClaimWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The server always recalculates `total_claimed_amount` from
 * `mediclaim_claim_expenses` rows and never trusts a client-supplied or
 * tampered total (ClaimWorkflowService::createDraft()/submit(), see (a) in
 * submit()'s docblock); `approved_amount` cannot exceed
 * `total_claimed_amount` (422 if attempted).
 *
 * GENUINE GAP CONFIRMED: directorFinalApproval()'s full signature is
 * `(MediclaimClaim $claim, User $director, string $decision, float
 * $approvedAmount, ?string $remarks, ?MediclaimFloaterOverride $override)`
 * — there is no `$expenses`/per-line parameter at all, and the method body
 * never touches `mediclaim_claim_expenses` rows. `MediclaimClaimExpense` has
 * `approved_amount`/`disallowed_amount`/`disallowed_reason` columns, but
 * nothing in ClaimWorkflowService or ReviewQueueController ever writes to
 * them — only the claim-level `total_approved_amount`/
 * `total_disallowed_amount` are set. Per-line disallow-reason enforcement is
 * NOT implemented; the test below demonstrates this directly.
 */
class MediclaimExpenseCalculationTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function a_client_supplied_total_is_ignored_at_creation_the_server_sums_expense_rows_instead(): void
    {
        $employee = $this->makeUser('Employee');
        $this->grant($employee, ['self.mediclaim.claim.create']);

        $created = $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/claims', [
                'total_claimed_amount' => 999999,
                'expenses' => [['category' => 'CONSULTATION_FEES', 'claimed_amount' => 1000]],
            ])->assertCreated()->json('data');

        $this->assertSame('1000.00', $created['total_claimed_amount']);
        $this->assertNotSame('999999.00', $created['total_claimed_amount']);
    }

    #[Test]
    public function submit_recalculates_the_total_from_expense_rows_overwriting_any_tampered_stored_value(): void
    {
        $employee = $this->makeUser('Employee');
        $this->grant($employee, ['self.mediclaim.claim.create', 'self.mediclaim.claim.submit']);

        $created = $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/claims', [
                'expenses' => [
                    ['category' => 'CONSULTATION_FEES', 'claimed_amount' => 1000],
                    ['category' => 'MEDICINES', 'claimed_amount' => 500],
                ],
            ])->assertCreated()->json('data');

        // Simulate a bypass/tamper directly against the row.
        DB::table('mediclaim_claims')->where('id', $created['id'])->update(['total_claimed_amount' => 555555]);
        $this->assertSame('555555.00', (string) MediclaimClaim::find($created['id'])->total_claimed_amount);

        $submitted = $this->actingAsUser($employee)
            ->postJson("/api/v1/mediclaim/claims/{$created['id']}/submit")
            ->assertOk()->json('data');

        $this->assertSame('1500.00', $submitted['total_claimed_amount'], 'submit() must recompute from the expense rows regardless of what was stored.');
    }

    #[Test]
    public function approved_amount_cannot_exceed_the_total_claimed_amount(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $director = $this->makeUser('Director', ['role' => 1]);
        $this->reportsTo($employee, $manager);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->createDraft($employee, ['expenses' => [['category' => 'CONSULTATION_FEES', 'claimed_amount' => 2000]]]);
        $claim = $workflow->submit($claim, $employee);
        $workflow->acknowledgeConfidentiality($claim, $manager);
        $claim = $workflow->managerDecision($claim->fresh(), $manager, 'approve');
        $claim = $workflow->coordinatorVerify($claim->fresh(), $director, 'verified');
        $claim = $workflow->committeeRecommend($claim->fresh(), $director, 'recommended');
        $claim = $workflow->hrVerifyEligibility($claim->fresh(), $director, 'verified');

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $workflow->directorFinalApproval($claim->fresh(), $director, 'approved', 5000.0);
    }

    #[Test]
    public function a_partial_approval_sets_only_the_claim_level_totals_never_per_line_amounts_or_reasons_documenting_a_gap(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $director = $this->makeUser('Director', ['role' => 1]);
        $this->reportsTo($employee, $manager);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->createDraft($employee, [
            'expenses' => [
                ['category' => 'CONSULTATION_FEES', 'claimed_amount' => 2000],
                ['category' => 'MEDICINES', 'claimed_amount' => 3000],
            ],
        ]);
        $expenseIds = $claim->expenses()->pluck('id');
        $claim = $workflow->submit($claim, $employee);
        $workflow->acknowledgeConfidentiality($claim, $manager);
        $claim = $workflow->managerDecision($claim->fresh(), $manager, 'approve');
        $claim = $workflow->coordinatorVerify($claim->fresh(), $director, 'verified');
        $claim = $workflow->committeeRecommend($claim->fresh(), $director, 'recommended');
        $claim = $workflow->hrVerifyEligibility($claim->fresh(), $director, 'verified');

        $decided = $workflow->directorFinalApproval($claim->fresh(), $director, 'partially_approved', 3000.0, 'Only the consultation and part of the medicine bill are payable.');

        $this->assertSame('3000.00', (string) $decided->total_approved_amount);
        $this->assertSame('2000.00', (string) $decided->total_disallowed_amount);

        // No per-line breakdown is ever written, even though the columns exist.
        foreach (MediclaimClaimExpense::whereIn('id', $expenseIds)->get() as $expense) {
            $this->assertNull($expense->approved_amount);
            $this->assertNull($expense->disallowed_amount);
            $this->assertNull($expense->disallowed_reason);
        }
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
            'email' => "mc-expense-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCEX{$number}",
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
