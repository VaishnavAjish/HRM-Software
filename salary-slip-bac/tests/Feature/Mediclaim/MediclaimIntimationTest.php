<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Permission;
use App\Models\User;
use App\Support\MediclaimIntimationNumber;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Intimation creation (emergency-explanation requirement, atomic reference
 * numbering) and — importantly — the real (non-)behavior of "planned
 * treatment without prior intimation" at claim submission time.
 *
 * GENUINE GAP CONFIRMED: PolicyEligibilityService::intimationRequired()
 * exists but is never called anywhere in the codebase (verified by a
 * repo-wide grep — only its own definition and one docblock reference in
 * IntimationController turn up). ClaimWorkflowService::submit() has no
 * intimation-requirement check at all beyond linking an already-attached
 * intimation_id if one is present. There is no flag/warning column on
 * mediclaim_claims (no `requires_review`/`intimation_flag`/similar in its
 * fillable list) and nothing sets one. The first test below asserts the
 * REAL behavior — an unflagged, unblocked submission — rather than the
 * plan's "flagged for review" expectation, and documents the gap plainly.
 */
class MediclaimIntimationTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function a_planned_treatment_claim_with_no_prior_intimation_submits_unflagged_and_unblocked_documenting_a_gap(): void
    {
        $employee = $this->makeUser('Employee');
        $this->grant($employee, ['self.mediclaim.claim.create', 'self.mediclaim.claim.read', 'self.mediclaim.claim.submit']);

        $created = $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/claims', [
                'treatment_type' => 'hospitalization',
                // Deliberately no intimation_id: this is exactly the
                // "planned treatment without prior intimation" scenario.
            ])->assertCreated()->json('data');

        $submitted = $this->actingAsUser($employee)
            ->postJson("/api/v1/mediclaim/claims/{$created['id']}/submit")
            ->assertOk()
            ->json('data');

        // Real behavior: it submits exactly like any other claim. No flag
        // column exists anywhere on the model/migration to assert against —
        // PolicyEligibilityService::intimationRequired() is unwired.
        $this->assertContains($submitted['status'], [MediclaimClaim::STATUS_MANAGER_REVIEW, MediclaimClaim::STATUS_SUBMITTED]);
        $this->assertArrayNotHasKey('requires_review', $submitted);
        $this->assertArrayNotHasKey('intimation_flag', $submitted);
    }

    #[Test]
    public function an_emergency_intimation_without_an_explanation_is_rejected(): void
    {
        $employee = $this->makeUser('Employee');
        $this->grant($employee, ['self.mediclaim.intimation.create']);

        $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/intimations', [
                'is_emergency' => true,
                'planned_treatment' => 'Emergency appendectomy',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['emergencyExplanation']);
    }

    #[Test]
    public function an_emergency_intimation_with_an_explanation_is_accepted_and_gets_a_reference_number(): void
    {
        $employee = $this->makeUser('Employee');
        $this->grant($employee, ['self.mediclaim.intimation.create']);

        $response = $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/intimations', [
                'is_emergency' => true,
                'emergency_explanation' => 'Patient was rushed to the ER following a road accident.',
                'planned_treatment' => 'Emergency surgery',
            ])->assertCreated()->json('data');

        $this->assertNotEmpty($response['reference_number']);
        $this->assertStringStartsWith('MCI-', $response['reference_number']);
    }

    #[Test]
    public function a_non_emergency_intimation_does_not_require_an_explanation(): void
    {
        $employee = $this->makeUser('Employee');
        $this->grant($employee, ['self.mediclaim.intimation.create']);

        $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/intimations', [
                'is_emergency' => false,
                'planned_treatment' => 'Planned knee surgery',
                'expected_admission_date' => now()->addWeek()->toDateString(),
            ])->assertCreated();
    }

    #[Test]
    public function intimation_reference_numbers_are_allocated_sequentially_and_uniquely(): void
    {
        $first = MediclaimIntimationNumber::next('nidhi-impex');
        $second = MediclaimIntimationNumber::next('nidhi-impex');
        $third = MediclaimIntimationNumber::next('nidhi-impex');

        $this->assertNotSame($first, $second);
        $this->assertNotSame($second, $third);

        $year = (int) date('Y');
        $this->assertSame("MCI-NIDHI-IMPEX-{$year}-000001", $first);
        $this->assertSame("MCI-NIDHI-IMPEX-{$year}-000002", $second);
        $this->assertSame("MCI-NIDHI-IMPEX-{$year}-000003", $third);
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-intimation-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCI{$number}",
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
