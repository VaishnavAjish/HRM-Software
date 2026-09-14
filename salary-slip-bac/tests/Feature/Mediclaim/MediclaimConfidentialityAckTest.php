<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Permission;
use App\Models\ReportingRelationship;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * ClaimWorkflowService::managerDecision() requires a prior confidentiality
 * acknowledgement on the manager-stage MediclaimClaimAssignment row — 409
 * CONFIDENTIALITY_ACK_REQUIRED otherwise (exact code confirmed from
 * MediclaimException::conflict() call sites in ClaimWorkflowService).
 */
class MediclaimConfidentialityAckTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function manager_cannot_decide_before_acknowledging_confidentiality(): void
    {
        [$claimId, $manager] = $this->submittedClaimAwaitingManager();

        $this->grant($manager, ['mediclaim.claim.manager.decide']);

        $this->actingAsUser($manager)
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", ['decision' => 'approve'])
            ->assertStatus(409)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error.code', 'CONFIDENTIALITY_ACK_REQUIRED');
    }

    #[Test]
    public function acknowledging_once_lets_the_manager_decide_and_a_second_ack_call_is_harmless(): void
    {
        [$claimId, $manager] = $this->submittedClaimAwaitingManager();
        $this->grant($manager, ['mediclaim.claim.manager.decide']);

        $this->actingAsUser($manager)
            ->postJson("/api/v1/mediclaim/claims/{$claimId}/confidentiality-ack")
            ->assertOk();

        // A later, separate request re-opening/re-acknowledging the same
        // assignment must not error or be required again.
        $this->actingAsUser($manager)
            ->postJson("/api/v1/mediclaim/claims/{$claimId}/confidentiality-ack")
            ->assertOk();

        $this->actingAsUser($manager)
            ->getJson("/api/v1/mediclaim/claims/{$claimId}")
            ->assertOk();

        $this->actingAsUser($manager)
            ->postJson("/api/v1/mediclaim/reviews/{$claimId}/decision", [
                'decision' => 'approve',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'COORDINATOR_VERIFICATION');
    }

    /** @return array{0:int,1:User} [claim id, manager] */
    private function submittedClaimAwaitingManager(): array
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

        $this->grant($employee, ['self.mediclaim.claim.create', 'self.mediclaim.claim.submit', 'self.mediclaim.claim.read']);

        $created = $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/claims', [])
            ->assertCreated()
            ->json('data');

        $submitted = $this->actingAsUser($employee)
            ->postJson("/api/v1/mediclaim/claims/{$created['id']}/submit")
            ->assertOk()
            ->assertJsonPath('data.status', 'MANAGER_REVIEW')
            ->json('data');

        return [$submitted['id'], $manager];
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-ack-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCK{$number}",
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
