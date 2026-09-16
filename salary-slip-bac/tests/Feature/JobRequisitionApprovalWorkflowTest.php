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
        $this->grant($this->hiringManager, ['hr.requisition.read', 'hr.requisition.hr_manager.read', 'hr.requisition.hr_manager.decide', 'hr.requisition.approve']);
        $this->grant($this->director, ['hr.requisition.read', 'hr.requisition.director.read', 'hr.requisition.director.decide', 'hr.requisition.approve']);
    }

    #[Test]
    public function approval_options_are_active_company_scoped_permission_qualified_and_exclude_the_requester(): void
    {
        $unqualified = $this->makeUser('Unqualified');
        $foreign = $this->makeUser('Foreign', ['company_code' => 'beta']);
        $this->grant($foreign, ['hr.requisition.hr_manager.decide', 'hr.requisition.director.decide']);
        $inactive = $this->makeUser('Inactive', ['status' => 'DISABLED']);
        $this->grant($inactive, ['hr.requisition.hr_manager.decide', 'hr.requisition.director.decide']);
        $requisition = $this->requisition();

        $hrManagers = $this->actingAsUser($this->requester)
            ->getJson("/api/hr/requisitions/approval-options?requisition_id={$requisition->id}")
            ->assertOk()
            ->json('data.hrManagers');
        $directors = $this->actingAsUser($this->requester)
            ->getJson("/api/hr/requisitions/approval-options?requisition_id={$requisition->id}&type=director")
            ->assertOk()
            ->json('data.directors');

        $hrManagerIds = array_column($hrManagers, 'id');
        $directorIds = array_column($directors, 'id');
        $this->assertContains($this->hiringManager->id, $hrManagerIds, json_encode($hrManagers));
        $this->assertContains($this->director->id, $directorIds);
        $this->assertNotContains($this->requester->id, $hrManagerIds);
        $this->assertNotContains($this->requester->id, $directorIds);
        $this->assertNotContains($unqualified->id, $hrManagerIds);
        $this->assertNotContains($foreign->id, $hrManagerIds);
        $this->assertNotContains($foreign->id, $directorIds);
        $this->assertNotContains($inactive->id, $hrManagerIds);
    }

    #[Test]
    public function submission_creates_an_immutable_two_step_cycle_and_locks_content(): void
    {
        $requisition = $this->requisition();

        $this->submit($requisition)->assertOk()->assertJsonPath('data.status', 'pending_hr_review');

        $fresh = $requisition->fresh();
        $cycle = JobRequisitionApprovalCycle::findOrFail($fresh->current_approval_cycle_id);
        $steps = $cycle->steps()->orderBy('step_order')->get();
        $this->assertSame(1, $cycle->cycle_number);
        $this->assertSame('Original title', $cycle->snapshot['requisition']['title']);
        $this->assertSame(JobRequisitionApprovalStep::TYPE_HR_MANAGER, $steps[0]->step_type);
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
    public function hr_manager_then_director_approval_is_enforced_and_final_approval_fields_are_preserved(): void
    {
        $requisition = $this->requisition();
        $this->submit($requisition)->assertOk();

        $this->actingAsUser($this->director)
            ->postJson("/api/hr/requisitions/{$requisition->id}/director/decision", ['decision' => 'approved'])
            ->assertStatus(422);

        $this->forward($requisition)
            ->assertOk()->assertJsonPath('data.status', 'pending_director_review');

        $this->actingAsUser($this->requester)
            ->putJson("/api/hr/requisitions/update/{$requisition->id}", ['title' => 'Changed during director review'])
            ->assertStatus(422);

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
    public function returning_requires_a_comment_and_resubmission_keeps_history(): void
    {
        $requisition = $this->requisition();
        $this->submit($requisition)->assertOk();

        $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/{$requisition->id}/hr-manager/return-to-department-head", ['comment' => 'No'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['comment']);

        $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/{$requisition->id}/hr-manager/return-to-department-head", [
                'comment' => 'Role scope needs revision.',
            ])->assertOk()->assertJsonPath('data.status', 'revision_requested');

        $firstCycle = $requisition->fresh()->currentApprovalCycle;
        $this->assertSame(
            JobRequisitionApprovalStep::STATUS_RETURNED,
            $firstCycle->steps()->where('step_type', JobRequisitionApprovalStep::TYPE_HR_MANAGER)->value('status'),
        );

        $this->actingAsUser($this->requester)
            ->putJson("/api/hr/requisitions/update/{$requisition->id}", ['title' => 'Revised title'])
            ->assertOk();
        $this->submit($requisition->fresh())->assertOk()->assertJsonPath('data.status', 'pending_hr_review');

        $this->assertSame(2, $requisition->approvalCycles()->count());
        $this->assertSame([1, 2], $requisition->approvalCycles()->reorder('cycle_number')->pluck('cycle_number')->all());
        $this->assertSame('Original title', $firstCycle->fresh()->snapshot['requisition']['title']);
        $this->assertSame('Revised title', $requisition->fresh()->currentApprovalCycle->snapshot['requisition']['title']);
    }

    #[Test]
    public function self_approval_same_reviewer_and_legacy_stage_bypass_are_rejected(): void
    {
        $requisition = $this->requisition();
        $this->grant($this->requester, ['hr.requisition.hr_manager.decide', 'hr.requisition.director.decide']);
        $this->grant($this->hiringManager, ['hr.requisition.director.decide']);

        $this->actingAsUser($this->requester)
            ->postJson("/api/hr/requisitions/{$requisition->id}/submit", ['hr_manager_id' => $this->requester->id])
            ->assertStatus(422);

        $this->actingAsUser($this->requester)
            ->postJson("/api/hr/requisitions/{$requisition->id}/submit")
            ->assertOk()->assertJsonPath('data.status', 'pending_hr_review');

        $this->actingAsUser($this->requester)
            ->postJson("/api/hr/requisitions/{$requisition->id}/hr-manager/forward", ['comment' => 'Approving my own request.'])
            ->assertStatus(422);

        $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/{$requisition->id}/hr-manager/forward", ['director_id' => $this->hiringManager->id])
            ->assertStatus(422);

        $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/{$requisition->id}/hr-manager/forward", ['comment' => 'Reviewed.'])
            ->assertOk()->assertJsonPath('data.status', 'pending_director_review');

        $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/{$requisition->id}/director/decision", ['decision' => 'approved'])
            ->assertStatus(422);

        $this->actingAsUser($this->requester)
            ->postJson("/api/hr/requisitions/{$requisition->id}/director/decision", ['decision' => 'approved'])
            ->assertStatus(422);

        $this->actingAsUser($this->director)
            ->postJson("/api/hr/requisitions/approve/{$requisition->id}")
            ->assertStatus(410);

        $this->assertSame('pending_director_review', $requisition->fresh()->status);
        $this->assertNull($requisition->fresh()->approved_by);
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
            ->putJson("/api/hr/requisitions/update/{$legacy->id}", ['title' => 'Edited while legacy pending'])
            ->assertStatus(422);

        $this->actingAsUser($this->requester)
            ->postJson("/api/hr/requisitions/{$legacy->id}/withdraw")
            ->assertOk()
            ->assertJsonPath('data.status', 'draft');

        $this->submit($legacy->fresh())
            ->assertOk()
            ->assertJsonPath('data.status', 'pending_hr_review');
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
                'hr_manager_id' => $this->hiringManager->id,
            ]);
    }

    private function forward(JobRequisition $requisition)
    {
        return $this->actingAsUser($this->hiringManager)
            ->postJson("/api/hr/requisitions/{$requisition->id}/hr-manager/forward", [
                'director_id' => $this->director->id,
                'comment' => 'Headcount and scope reviewed.',
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
