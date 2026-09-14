<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimAssignment;
use App\Models\Permission;
use App\Models\ReportingRelationship;
use App\Models\User;
use App\Services\Mediclaim\ClaimWorkflowService;
use App\Support\MediclaimClaimNumber;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * MediclaimClaimNumber::next()'s per-company+year counter locking, and
 * ClaimWorkflowService::submit()'s submission_idempotency_key replay
 * handling (a double-click/retried submit is a no-op, not a duplicate or an
 * error).
 */
class MediclaimClaimRaceConditionsTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function rapid_sequential_allocations_produce_different_sequential_numbers(): void
    {
        $first = MediclaimClaimNumber::next('nidhi-impex');
        $second = MediclaimClaimNumber::next('nidhi-impex');
        $third = MediclaimClaimNumber::next('nidhi-impex');

        $this->assertNotSame($first, $second);
        $this->assertNotSame($second, $third);

        $year = (int) date('Y');
        $this->assertSame("MC-NIDHI-IMPEX-{$year}-000001", $first);
        $this->assertSame("MC-NIDHI-IMPEX-{$year}-000002", $second);
        $this->assertSame("MC-NIDHI-IMPEX-{$year}-000003", $third);
    }

    #[Test]
    public function resubmitting_after_correction_does_not_reallocate_a_claim_number(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $this->reportsTo($employee, $manager);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->createDraft($employee, []);
        $claim = $workflow->submit($claim, $employee);
        $originalNumber = $claim->claim_number;
        $this->assertNotNull($originalNumber);

        $workflow->acknowledgeConfidentiality($claim, $manager);
        $claim = $workflow->managerDecision($claim->fresh(), $manager, 'return', 'Please attach the hospital bill.');
        $this->assertSame(MediclaimClaim::STATUS_RETURNED_FOR_CORRECTION, $claim->status);

        $resubmitted = $workflow->submit($claim->fresh(), $employee);

        $this->assertSame($originalNumber, $resubmitted->claim_number, 'A resubmission must not burn a second claim number.');
        $this->assertSame(2, (int) $resubmitted->current_revision);
    }

    #[Test]
    public function submit_with_the_same_idempotency_key_returns_the_original_claim_instead_of_erroring(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $this->reportsTo($employee, $manager);

        $workflow = app(ClaimWorkflowService::class);
        $draft = $workflow->createDraft($employee, []);

        $first = $workflow->submit($draft, $employee, 'idem-key-123');
        $this->assertSame(MediclaimClaim::STATUS_MANAGER_REVIEW, $first->status);
        $this->assertSame('idem-key-123', $first->submission_idempotency_key);

        // Replay: same claim, already past DRAFT, same key — must be a
        // silent no-op returning the existing claim, not a validation error
        // and not a second assignment/claim-number allocation.
        $second = $workflow->submit($first->fresh(), $employee, 'idem-key-123');

        $this->assertSame($first->id, $second->id);
        $this->assertSame($first->claim_number, $second->claim_number);
        $this->assertSame(MediclaimClaim::STATUS_MANAGER_REVIEW, $second->status);

        $this->assertSame(
            1,
            MediclaimClaimAssignment::where('claim_id', $first->id)
                ->where('stage', MediclaimClaimAssignment::STAGE_MANAGER_REVIEW)
                ->count(),
            'The replay must not create a second manager-stage assignment.'
        );
    }

    #[Test]
    public function a_double_submit_over_http_with_the_same_idempotency_key_header_is_a_no_op(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        $this->reportsTo($employee, $manager);
        $this->grant($employee, ['self.mediclaim.claim.create', 'self.mediclaim.claim.read', 'self.mediclaim.claim.submit']);

        $created = $this->actingAsUser($employee)->postJson('/api/v1/mediclaim/me/claims', [])->assertCreated()->json('data');

        $first = $this->actingAsUser($employee)
            ->withHeader('Idempotency-Key', 'http-idem-1')
            ->postJson("/api/v1/mediclaim/claims/{$created['id']}/submit")
            ->assertOk()->json('data');

        $second = $this->actingAsUser($employee)
            ->withHeader('Idempotency-Key', 'http-idem-1')
            ->postJson("/api/v1/mediclaim/claims/{$created['id']}/submit")
            ->assertOk()->json('data');

        $this->assertSame($first['claim_number'], $second['claim_number']);
        $this->assertSame(
            1,
            MediclaimClaimAssignment::where('claim_id', $created['id'])
                ->where('stage', MediclaimClaimAssignment::STAGE_MANAGER_REVIEW)
                ->count()
        );
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
            'email' => "mc-race-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCR{$number}",
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
