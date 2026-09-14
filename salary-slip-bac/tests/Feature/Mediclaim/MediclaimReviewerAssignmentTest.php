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
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * MediclaimClaim::scopeAwaitingReviewBy()/scopeDecidableBy() against
 * mediclaim_reviewer_assignments — the primary reviewer for a stage can act;
 * a reviewer outside their active_from/active_to window or deactivated
 * cannot (404, resource-scope concealment, same as everywhere else in this
 * module) and a backup within range can.
 *
 * GENUINE GAP CONFIRMED (exhaustive grep across app/Services/Mediclaim and
 * app/Http/Controllers/Api/V1/Mediclaim for `is_backup`): there is NO
 * primary-then-backup precedence anywhere. scopeAwaitingReviewBy()'s
 * mediclaim_reviewer_assignments subquery never filters on `is_backup` — ANY
 * active row for the role (primary or backup) authorizes equally, whether or
 * not the OTHER row is currently active. The last test below demonstrates
 * this directly: a backup reviewer can decide a claim even while the primary
 * reviewer's assignment is simultaneously fully active — "backup" here is
 * not a fallback-when-primary-unavailable mechanism, just an unconditional
 * second row for the same role.
 */
class MediclaimReviewerAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function the_primary_reviewer_can_see_and_decide_the_pending_claim(): void
    {
        $claim = $this->claimAtCoordinatorStage();
        $primary = $this->makeUser('Primary Coordinator', ['role' => 1]);
        $this->assignReviewer($primary, ['is_backup' => false]);
        $this->grant($primary, ['mediclaim.claim.coordinator.decide']);

        $this->actingAsUser($primary)
            ->getJson('/api/v1/mediclaim/reviews/pending')
            ->assertOk()
            ->assertJsonFragment(['id' => $claim->id]);

        $this->actingAsUser($primary)
            ->postJson("/api/v1/mediclaim/reviews/{$claim->id}/decision", ['decision' => 'verified'])
            ->assertOk()
            ->assertJsonPath('data.status', 'COMMITTEE_RECOMMENDATION');
    }

    #[Test]
    public function a_reviewer_outside_their_active_date_range_cannot_decide_but_a_backup_within_range_can(): void
    {
        $claim = $this->claimAtCoordinatorStage();
        $expiredPrimary = $this->makeUser('Expired Primary', ['role' => 1]);
        $backup = $this->makeUser('Backup Coordinator', ['role' => 1]);
        $this->assignReviewer($expiredPrimary, [
            'is_backup' => false,
            'active_from' => now()->subYear()->toDateString(),
            'active_to' => now()->subDay()->toDateString(),
        ]);
        $this->assignReviewer($backup, ['is_backup' => true]);
        $this->grant($expiredPrimary, ['mediclaim.claim.coordinator.decide']);
        $this->grant($backup, ['mediclaim.claim.coordinator.decide']);

        $this->actingAsUser($expiredPrimary)
            ->postJson("/api/v1/mediclaim/reviews/{$claim->id}/decision", ['decision' => 'verified'])
            ->assertNotFound();

        $this->actingAsUser($backup)
            ->postJson("/api/v1/mediclaim/reviews/{$claim->id}/decision", ['decision' => 'verified'])
            ->assertOk()
            ->assertJsonPath('data.status', 'COMMITTEE_RECOMMENDATION');
    }

    #[Test]
    public function a_deactivated_reviewer_cannot_decide_but_an_active_backup_can(): void
    {
        $claim = $this->claimAtCoordinatorStage();
        $deactivatedPrimary = $this->makeUser('Deactivated Primary', ['role' => 1]);
        $backup = $this->makeUser('Backup Coordinator', ['role' => 1]);
        $this->assignReviewer($deactivatedPrimary, ['is_backup' => false, 'status' => 'inactive']);
        $this->assignReviewer($backup, ['is_backup' => true]);
        $this->grant($deactivatedPrimary, ['mediclaim.claim.coordinator.decide']);
        $this->grant($backup, ['mediclaim.claim.coordinator.decide']);

        $this->actingAsUser($deactivatedPrimary)
            ->postJson("/api/v1/mediclaim/reviews/{$claim->id}/decision", ['decision' => 'verified'])
            ->assertNotFound();

        $this->actingAsUser($backup)
            ->postJson("/api/v1/mediclaim/reviews/{$claim->id}/decision", ['decision' => 'verified'])
            ->assertOk()
            ->assertJsonPath('data.status', 'COMMITTEE_RECOMMENDATION');
    }

    #[Test]
    public function gap_a_backup_can_decide_even_while_the_primary_is_simultaneously_fully_active(): void
    {
        $claim = $this->claimAtCoordinatorStage();
        $primary = $this->makeUser('Active Primary', ['role' => 1]);
        $backup = $this->makeUser('Active Backup', ['role' => 1]);
        $this->assignReviewer($primary, ['is_backup' => false]);
        $this->assignReviewer($backup, ['is_backup' => true]);
        $this->grant($primary, ['mediclaim.claim.coordinator.decide']);
        $this->grant($backup, ['mediclaim.claim.coordinator.decide']);

        // Both the primary and the backup can currently see the same pending item.
        $this->actingAsUser($primary)->getJson('/api/v1/mediclaim/reviews/pending')->assertOk()->assertJsonFragment(['id' => $claim->id]);
        $this->actingAsUser($backup)->getJson('/api/v1/mediclaim/reviews/pending')->assertOk()->assertJsonFragment(['id' => $claim->id]);

        // The backup decides it FIRST, with the primary still fully active —
        // there is no primary-unavailable precondition gating this.
        $this->actingAsUser($backup)
            ->postJson("/api/v1/mediclaim/reviews/{$claim->id}/decision", ['decision' => 'verified'])
            ->assertOk()
            ->assertJsonPath('data.status', 'COMMITTEE_RECOMMENDATION');
    }

    private function claimAtCoordinatorStage(): MediclaimClaim
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        ReportingRelationship::create([
            'employee_user_id' => $employee->id,
            'manager_user_id' => $manager->id,
            'relationship_type' => ReportingRelationship::TYPE_PRIMARY,
            'status' => ReportingRelationship::STATUS_ACTIVE,
            'effective_from' => now()->subDay()->toDateString(),
            'effective_to' => null,
        ]);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->submit($workflow->createDraft($employee, []), $employee);
        $workflow->acknowledgeConfidentiality($claim, $manager);

        return $workflow->managerDecision($claim->fresh(), $manager, 'approve');
    }

    private function assignReviewer(User $user, array $overrides = []): MediclaimReviewerAssignment
    {
        return MediclaimReviewerAssignment::create($overrides + [
            'company_code' => 'nidhi-impex',
            'policy_id' => null,
            'role' => 'coordinator',
            'user_id' => $user->id,
            'is_backup' => false,
            'active_from' => null,
            'active_to' => null,
            'status' => 'active',
        ]);
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-reviewer-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCRV{$number}",
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
