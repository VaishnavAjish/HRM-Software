<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimAssignment;
use App\Models\Mediclaim\MediclaimClaimEvent;
use App\Models\Permission;
use App\Models\ReportingRelationship;
use App\Models\User;
use App\Services\Mediclaim\ClaimWorkflowService;
use App\Services\Mediclaim\MediclaimException;
use App\Services\Mediclaim\ReportingSubtreeResolver;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * ReportingSubtreeResolver's BFS (used by GET /team/claims), the
 * assigned_manager_id point-in-time snapshot taken at submit() (which must
 * NOT silently re-resolve against a later reporting-line change), and
 * ClaimWorkflowService::reassignReviewer()'s mandatory-reason + audit
 * behavior.
 *
 * Note: as of this snapshot of the codebase there is no HTTP route wired to
 * reassignReviewer() (routes/mediclaim.php seeds the `mediclaim.claim.reassign`
 * permission but no controller action calls it) — those assertions exercise
 * the service directly.
 */
class MediclaimManagerSubtreeTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function a_direct_reports_claim_is_visible_to_the_manager_via_team_claims(): void
    {
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $employee = $this->makeUser('Direct Report');
        $this->reportsTo($employee, $manager);
        $this->grant($manager, ['mediclaim.team_claim.read']);

        $claim = MediclaimClaim::create([
            'company_code' => 'nidhi-impex',
            'employee_user_id' => $employee->id,
            'status' => MediclaimClaim::STATUS_SUBMITTED,
        ]);

        $this->actingAsUser($manager)
            ->getJson('/api/v1/mediclaim/team/claims')
            ->assertOk()
            ->assertJsonFragment(['id' => $claim->id]);
    }

    #[Test]
    public function a_second_level_nested_reports_claim_is_also_visible_via_bfs(): void
    {
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $middle = $this->makeUser('Middle Manager', ['role' => 1]);
        $grandchild = $this->makeUser('Grandchild Report');
        $this->reportsTo($middle, $manager);
        $this->reportsTo($grandchild, $middle);
        $this->grant($manager, ['mediclaim.team_claim.read']);

        $directClaim = MediclaimClaim::create([
            'company_code' => 'nidhi-impex',
            'employee_user_id' => $middle->id,
            'status' => MediclaimClaim::STATUS_SUBMITTED,
        ]);
        $nestedClaim = MediclaimClaim::create([
            'company_code' => 'nidhi-impex',
            'employee_user_id' => $grandchild->id,
            'status' => MediclaimClaim::STATUS_SUBMITTED,
        ]);

        $response = $this->actingAsUser($manager)->getJson('/api/v1/mediclaim/team/claims')->assertOk();
        $response->assertJsonFragment(['id' => $directClaim->id]);
        $response->assertJsonFragment(['id' => $nestedClaim->id]);
    }

    #[Test]
    public function a_manually_crafted_reporting_cycle_terminates_instead_of_infinite_looping(): void
    {
        $a = $this->makeUser('Cycle A', ['role' => 1]);
        $b = $this->makeUser('Cycle B', ['role' => 1]);

        // A "manages" B, and B "manages" A — a cycle only possible via a
        // directly-crafted database row (never producible through the
        // reassignment API, which always ends the outgoing relationship
        // first), exactly what the cycle guard exists for.
        $this->reportsTo($b, $a);
        $this->reportsTo($a, $b);

        $resolver = app(ReportingSubtreeResolver::class);
        $result = $resolver->subtreeUserIds($a->id);

        // Terminates (this assertion is reached at all only if it didn't
        // hang), returns a deduplicated, bounded result, and never includes
        // the manager itself.
        $this->assertSame([$b->id], $result);
        $this->assertNotContains($a->id, $result);
        $this->assertTrue($resolver->isInSubtree($a->id, $b->id));
        $this->assertFalse($resolver->isInSubtree($a->id, $a->id));
    }

    #[Test]
    public function assigned_manager_snapshot_survives_a_later_reporting_line_change(): void
    {
        $employee = $this->makeUser('Employee');
        $managerA = $this->makeUser('Manager A', ['role' => 1]);
        $managerB = $this->makeUser('Manager B', ['role' => 1]);
        $this->reportsTo($employee, $managerA);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->createDraft($employee, []);
        $claim = $workflow->submit($claim, $employee);

        $this->assertSame($managerA->id, $claim->assigned_manager_id);
        $this->assertSame(MediclaimClaim::STATUS_MANAGER_REVIEW, $claim->status);

        // Reassign the real reporting line to Manager B *after* submission.
        ReportingRelationship::query()
            ->where('employee_user_id', $employee->id)
            ->where('manager_user_id', $managerA->id)
            ->where('status', ReportingRelationship::STATUS_ACTIVE)
            ->update(['status' => ReportingRelationship::STATUS_ENDED, 'effective_to' => now()->toDateString()]);
        $this->reportsTo($employee, $managerB);

        $fresh = $claim->fresh();
        $this->assertSame($managerA->id, $fresh->assigned_manager_id, 'The snapshot must not silently re-resolve.');

        // Manager B — who now really manages the employee — still cannot
        // decide this in-flight claim: authorization is against the frozen
        // snapshot, not a live lookup.
        try {
            $workflow->managerDecision($fresh, $managerB, 'approve');
            $this->fail('Expected a WRONG_ASSIGNED_REVIEWER exception for the reassigned manager.');
        } catch (MediclaimException $e) {
            $this->assertSame('WRONG_ASSIGNED_REVIEWER', $e->errorCode);
            $this->assertSame(403, $e->status);
        }

        // Manager A — the original snapshot — can still act.
        $workflow->acknowledgeConfidentiality($fresh, $managerA);
        $decided = $workflow->managerDecision($fresh->fresh(), $managerA, 'approve');
        $this->assertSame(MediclaimClaim::STATUS_COORDINATOR_VERIFICATION, $decided->status);
    }

    #[Test]
    public function reassignment_without_a_reason_is_rejected(): void
    {
        $employee = $this->makeUser('Employee');
        $managerA = $this->makeUser('Manager A', ['role' => 1]);
        $managerB = $this->makeUser('Manager B', ['role' => 1]);
        $hr = $this->makeUser('HR Actor', ['role' => 1]);
        $this->reportsTo($employee, $managerA);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->submit($workflow->createDraft($employee, []), $employee);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $workflow->reassignReviewer($claim, $hr, MediclaimClaimAssignment::STAGE_MANAGER_REVIEW, $managerB->id, 'no');
    }

    #[Test]
    public function reassignment_supersedes_the_old_assignment_updates_the_snapshot_and_is_audited(): void
    {
        $employee = $this->makeUser('Employee');
        $managerA = $this->makeUser('Manager A', ['role' => 1]);
        $managerB = $this->makeUser('Manager B', ['role' => 1]);
        $hr = $this->makeUser('HR Actor', ['role' => 1]);
        $this->reportsTo($employee, $managerA);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->submit($workflow->createDraft($employee, []), $employee);

        $oldAssignment = MediclaimClaimAssignment::query()
            ->where('claim_id', $claim->id)
            ->where('stage', MediclaimClaimAssignment::STAGE_MANAGER_REVIEW)
            ->where('status', 'ACTIVE')
            ->firstOrFail();

        $eventCountBefore = MediclaimClaimEvent::where('claim_id', $claim->id)->count();

        $reassigned = $workflow->reassignReviewer(
            $claim,
            $hr,
            MediclaimClaimAssignment::STAGE_MANAGER_REVIEW,
            $managerB->id,
            'Manager A is on extended leave; reassigning per HR policy.'
        );

        $this->assertSame($managerB->id, $reassigned->assigned_manager_id);

        $this->assertSame('SUPERSEDED', $oldAssignment->fresh()->status);
        $newAssignment = MediclaimClaimAssignment::query()
            ->where('claim_id', $claim->id)
            ->where('stage', MediclaimClaimAssignment::STAGE_MANAGER_REVIEW)
            ->where('status', 'ACTIVE')
            ->firstOrFail();
        $this->assertSame($managerB->id, $newAssignment->assigned_to);
        $this->assertSame($newAssignment->id, $oldAssignment->fresh()->superseded_by_assignment_id);

        $eventCountAfter = MediclaimClaimEvent::where('claim_id', $claim->id)->count();
        $this->assertGreaterThan($eventCountBefore, $eventCountAfter);
        $this->assertDatabaseHas('mediclaim_claim_events', [
            'claim_id' => $claim->id,
            'event_type' => 'REVIEWER_REASSIGNED',
        ]);
    }

    private function reportsTo(User $employee, User $manager): ReportingRelationship
    {
        return ReportingRelationship::create([
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
            'email' => "mc-subtree-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCS{$number}",
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
