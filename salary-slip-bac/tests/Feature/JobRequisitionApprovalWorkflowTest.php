<?php

namespace Tests\Feature;

use App\Models\JobRequisition;
use App\Models\JobRequisitionApprovalCycle;
use App\Models\JobRequisitionApprovalStep;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\AuthorizationEngine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class JobRequisitionApprovalWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    private User $requester;

    private User $hiringManager;

    private User $director;

    protected function setUp(): void
    {
        parent::setUp();

        $this->requester = $this->makeUser('Requester');
        $this->hiringManager = $this->makeUser('Hiring Manager');
        $this->director = $this->makeUser('Director');

        $this->grant($this->requester, ['hr.requisition.read', 'hr.requisition.submit', 'hr.requisition.withdraw', 'hr.requisition.update', 'hr.requisition.publish']);
        $this->grant($this->hiringManager, ['hr.requisition.read', 'hr.requisition.hiring_manager.read', 'hr.requisition.hiring_manager.decide', 'hr.requisition.approve']);
        $this->grant($this->director, ['hr.requisition.read', 'hr.requisition.director.read', 'hr.requisition.director.decide', 'hr.requisition.approve']);
    }

    #[Test]
    public function approval_options_are_active_company_scoped_permission_qualified_and_exclude_the_requester(): void
    {
        $unqualified = $this->makeUser('Unqualified');
        $foreign = $this->makeUser('Foreign', ['company_code' => 'beta']);
        $this->grant($foreign, ['hr.requisition.hiring_manager.decide', 'hr.requisition.director.decide']);
        $inactive = $this->makeUser('Inactive', ['status' => 'DISABLED']);
        $this->grant($inactive, ['hr.requisition.hiring_manager.decide', 'hr.requisition.director.decide']);
        $requisition = $this->requisition();

        $this->assertContains($this->hiringManager->id, User::query()->visible()->pluck('id')->all());
        $decision = app(AuthorizationEngine::class)->decide(
            $this->hiringManager,
            'hr.requisition.hiring_manager.decide',
            ['company_code' => 'alpha'],
            ['audit' => false],
        );
        $this->assertTrue($decision->allowed, $decision->reasonCode);

        $data = $this->actingAsUser($this->requester)
            ->getJson("/api/hr/requisitions/approval-options?requisition_id={$requisition->id}")
            ->assertOk()
            ->json('data');

        $hiringManagerIds = array_column($data['hiringManagers'], 'id');
        $directorIds = array_column($data['directors'], 'id');
        $this->assertContains($this->hiringManager->id, $hiringManagerIds, json_encode($data));
        $this->assertContains($this->director->id, $directorIds);
        $this->assertNotContains($this->requester->id, $hiringManagerIds);
        $this->assertNotContains($unqualified->id, $hiringManagerIds);
        $this->assertNotContains($foreign->id, $hiringManagerIds);
        $this->assertNotContains($inactive->id, $hiringManagerIds);
    }

    #[Test]
    public function submission_creates_an_immutable_two_step_cycle_and_locks_content(): void
    {
        $requisition = $this->requisition();

        $this->submit($requisition)->assertOk()->assertJsonPath('data.status', 'pending_approval');

        $fresh = $requisition->fresh();
        $cycle = JobRequisitionApprovalCycle::findOrFail($fresh->current_approval_cycle_id);
        $steps = $cycle->steps()->orderBy('step_order')->get();
        $this->assertSame(1, $cycle->cycle_number);
        $this->assertSame('Original title', $cycle->snapshot['requisition']['title']);
        $this->assertSame(JobRequisitionApprovalStep::STATUS_PENDING, $steps[0]->status);
        $this->assertSame(JobRequisitionApprovalStep::STATUS_WAITING, $steps[1]->status);

        $this->actingAsUser($this->requester)
            ->putJson("/api/hr/requisitions/update/{$requisition->id}", ['title' => 'Changed while pending'])
            ->assertStatus(422);
        $this->actingAsUser($this->requester)
            ->postJson("/api/hr/requisitions/publish/{$requisition->id}")
            ->assertStatus(422);

        $this->assertSame('Original title', $requisition->fresh()->title);
    }

    #[Test]
    public function hiring_manager_then_director_approval_is_enforced_and_final_approval_fields_are_preserved(): void
    {
        $requisition = $this->requisition();
        $this->submit($requisition)->assertOk();

        $this->actingAsUser($this->director)
            ->postJson("/api/hr/requisitions/{$requisition->id}/director/decision", ['decision' => 'approved'])
            ->assertStatus(422);

        $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/{$requisition->id}/hiring-manager/decision", [
                'decision' => 'approved',
                'comment' => 'Headcount and scope reviewed.',
            ])->assertOk()->assertJsonPath('data.status', 'pending_approval');

        $this->actingAsUser($this->director)
            ->postJson("/api/hr/requisitions/{$requisition->id}/director/decision", [
                'decision' => 'approved',
                'comment' => 'Budget approved.',
            ])->assertOk()->assertJsonPath('data.status', 'approved');

        $fresh = $requisition->fresh();
        $this->assertSame($this->director->id, $fresh->approved_by);
        $this->assertNotNull($fresh->approved_at);
        $this->assertSame(JobRequisitionApprovalCycle::STATUS_APPROVED, $fresh->currentApprovalCycle->status);
    }

    #[Test]
    public function rejection_requires_a_comment_skips_later_steps_and_resubmission_keeps_history(): void
    {
        $requisition = $this->requisition();
        $this->submit($requisition)->assertOk();

        $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/{$requisition->id}/hiring-manager/decision", ['decision' => 'rejected', 'comment' => 'No'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['comment']);

        $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/{$requisition->id}/hiring-manager/decision", [
                'decision' => 'rejected',
                'comment' => 'Role scope needs revision.',
            ])->assertOk()->assertJsonPath('data.status', 'rejected');

        $firstCycle = $requisition->fresh()->currentApprovalCycle;
        $this->assertSame(JobRequisitionApprovalCycle::STATUS_REJECTED, $firstCycle->status);
        $this->assertSame(
            JobRequisitionApprovalStep::STATUS_SKIPPED,
            $firstCycle->steps()->where('step_type', JobRequisitionApprovalStep::TYPE_DIRECTOR)->value('status'),
        );

        $this->actingAsUser($this->requester)
            ->putJson("/api/hr/requisitions/update/{$requisition->id}", ['title' => 'Revised title'])
            ->assertOk();
        $this->submit($requisition->fresh())->assertOk();

        $this->assertSame(2, $requisition->approvalCycles()->count());
        $this->assertSame([1, 2], $requisition->approvalCycles()->reorder('cycle_number')->pluck('cycle_number')->all());
        $this->assertSame('Original title', $firstCycle->snapshot['requisition']['title']);
        $this->assertSame('Revised title', $requisition->fresh()->currentApprovalCycle->snapshot['requisition']['title']);
    }

    #[Test]
    public function self_approval_same_reviewer_and_legacy_stage_bypass_are_rejected(): void
    {
        $requisition = $this->requisition();
        $this->grant($this->requester, ['hr.requisition.hiring_manager.decide']);

        $this->actingAsUser($this->requester)
            ->postJson("/api/hr/requisitions/{$requisition->id}/submit", [
                'hiring_manager_id' => $this->requester->id,
                'director_id' => $this->director->id,
            ])->assertStatus(422);

        $this->actingAsUser($this->requester)
            ->postJson("/api/hr/requisitions/{$requisition->id}/submit", [
                'hiring_manager_id' => $this->hiringManager->id,
                'director_id' => $this->hiringManager->id,
            ])->assertStatus(422);

        $this->submit($requisition)->assertOk();
        $this->actingAsUser($this->director)
            ->postJson("/api/hr/requisitions/approve/{$requisition->id}")
            ->assertStatus(422);
        $this->assertSame('pending_approval', $requisition->fresh()->status);

        $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/approve/{$requisition->id}")
            ->assertOk();
        $this->assertSame('pending_approval', $requisition->fresh()->status);
    }

    #[Test]
    public function a_pending_request_can_be_withdrawn_only_by_the_requester(): void
    {
        $this->grant($this->hiringManager, ['hr.requisition.withdraw']);
        $requisition = $this->requisition();
        $this->submit($requisition)->assertOk();

        $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/{$requisition->id}/withdraw")
            ->assertStatus(422);

        $this->actingAsUser($this->requester)
            ->postJson("/api/hr/requisitions/{$requisition->id}/withdraw")
            ->assertOk()
            ->assertJsonPath('data.status', 'draft');

        $this->assertSame(JobRequisitionApprovalCycle::STATUS_WITHDRAWN, $requisition->fresh()->currentApprovalCycle->status);
    }

    #[Test]
    public function a_legacy_pending_requisition_can_only_be_recovered_to_draft_and_resubmitted(): void
    {
        $legacy = $this->requisition(['status' => 'pending_approval']);
        $this->grant($this->hiringManager, ['hr.requisition.withdraw']);

        $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/{$legacy->id}/withdraw")
            ->assertStatus(422);

        $this->actingAsUser($this->requester)
            ->postJson("/api/hr/requisitions/{$legacy->id}/withdraw")
            ->assertOk()
            ->assertJsonPath('data.status', 'draft');

        $this->submit($legacy->fresh())
            ->assertOk()
            ->assertJsonPath('data.status', 'pending_approval');
        $this->assertNotNull($legacy->fresh()->current_approval_cycle_id);
    }

    #[Test]
    public function legacy_approve_roles_receive_the_new_review_permissions_idempotently(): void
    {
        $role = Role::create([
            'name' => 'Legacy Requisition Approver',
            'code' => 'legacy_requisition_approver',
            'type' => 'Custom',
            'is_active' => true,
            'status' => 'ACTIVE',
        ]);
        $source = Permission::query()->where('code', 'hr.requisition.approve')->firstOrFail();
        DB::table('role_permissions')->insert([
            'role_id' => $role->id,
            'permission_id' => $source->id,
            'effect' => 'ALLOW',
            'obligations' => null,
            'inherit_to_children' => true,
        ]);

        $cache = app(AuthorizationCache::class);
        $beforeVersion = $cache->version(null);
        $migration = require database_path('migrations/2026_08_14_010100_seed_job_requisition_approval_permissions.php');
        $migration->up();
        $migration->up();

        $targetCodes = [
            'hr.requisition.hiring_manager.read',
            'hr.requisition.hiring_manager.decide',
            'hr.requisition.director.read',
            'hr.requisition.director.decide',
            'ui.hr.hiring.hiring_manager_review',
            'ui.hr.hiring.hiring_manager_review.decide',
            'ui.hr.hiring.director_review',
            'ui.hr.hiring.director_review.decide',
        ];
        $targetIds = Permission::query()->whereIn('code', $targetCodes)->pluck('id');

        $this->assertCount(count($targetCodes), $targetIds);
        $this->assertSame(
            count($targetCodes),
            DB::table('role_permissions')
                ->where('role_id', $role->id)
                ->whereIn('permission_id', $targetIds)
                ->where('effect', 'ALLOW')
                ->count(),
        );
        $this->assertGreaterThan($beforeVersion, $cache->version(null));
    }

    private function submit(JobRequisition $requisition)
    {
        return $this->actingAsUser($this->requester)
            ->postJson("/api/hr/requisitions/{$requisition->id}/submit", [
                'hiring_manager_id' => $this->hiringManager->id,
                'director_id' => $this->director->id,
            ]);
    }

    private function requisition(array $overrides = []): JobRequisition
    {
        return JobRequisition::create($overrides + [
            'title' => 'Original title',
            'status' => 'draft',
            'company_code' => 'alpha',
            'unit' => 'Ichapur',
            'requested_by' => $this->requester->id,
            'openings' => 2,
            'priority' => 'medium',
        ]);
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "requisition-approval-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "RAW{$number}",
            'role' => 3,
            'company_code' => 'alpha',
            'unit' => 'Ichapur',
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
