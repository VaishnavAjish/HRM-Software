<?php

namespace App\Services\Hr;

use App\Models\Department;
use App\Models\JobRequisition;
use App\Models\JobRequisitionApprovalCycle;
use App\Models\JobRequisitionApprovalStep;
use App\Models\Notification;
use App\Models\User;
use App\Services\Authorization\AuthorizationEngine;
use App\Support\CompanyMembership;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\ValidationException;

class JobRequisitionApprovalService
{
    public function __construct(private readonly AuthorizationEngine $authorization)
    {
    }

    public function eligibleApprovers(JobRequisition $requisition, User $actor, string $type = 'hr-manager', ?string $search = null): array
    {
        $companyCodes = CompanyMembership::parse($requisition->company_code);
        $query = User::query()
            ->visible()
            ->where('is_deleted', 0)
            ->whereIn('status', ['0', 'ACTIVE'])
            ->select(['id', 'name', 'email', 'designation', 'company_code', 'unit', 'department', 'role', 'type', 'status', 'is_deleted']);

        if ($search) {
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%")
                    ->orWhere('designation', 'like', "%{$search}%");
            });
        }

        if ($companyCodes !== []) {
            $query->where(function ($q) use ($companyCodes) {
                foreach ($companyCodes as $companyCode) {
                    $q->orWhereRaw("(',' || COALESCE(company_code, '') || ',') LIKE ?", ['%,' . $companyCode . ',%']);
                }
                $q->orWhereRaw("(',' || COALESCE(company_code, '') || ',') LIKE ?", ['%,all,%'])
                    ->orWhereRaw("(',' || COALESCE(company_code, '') || ',') LIKE ?", ['%,all-companies,%']);
            });
        }

        $users = $query->orderBy('name')->get();
        $resource = ['company_code' => $requisition->company_code, 'department_id' => $requisition->department_id];

        $excludedIds = array_filter([(int) $requisition->requested_by, (int) $actor->id]);

        if ($type === 'director' && $requisition->hr_manager_id) {
            $excludedIds[] = (int) $requisition->hr_manager_id;
        }

        $permission = match ($type) {
            'director' => 'hr.requisition.director.decide',
            default => 'hr.requisition.hr_manager.decide',
        };

        $eligible = $users->reject(fn (User $user) => in_array((int) $user->id, $excludedIds, true))
            ->filter(function (User $user) use ($permission, $resource) {
                $decision = $this->authorization->decide($user, $permission, $resource, ['audit' => false]);
                if ($decision->allowed) {
                    return true;
                }
                // Fallback for legacy hiring manager permission
                if ($permission === 'hr.requisition.hr_manager.decide') {
                    return $this->authorization->decide($user, 'hr.requisition.hiring_manager.decide', $resource, ['audit' => false])->allowed;
                }
                return false;
            })
            ->values();

        return [
            'approvers' => $eligible,
            'hrManagers' => $type === 'hr-manager' ? $eligible : [],
            'directors' => $type === 'director' ? $eligible : [],
        ];
    }

    public function submit(JobRequisition $requisition, User $actor, int $hrManagerId): JobRequisition
    {
        return DB::transaction(function () use ($requisition, $actor, $hrManagerId) {
            $locked = JobRequisition::query()->lockForUpdate()->findOrFail($requisition->id);

            if (! in_array($locked->status, ['draft', 'revision_requested', 'rejected', 'cancelled'], true)) {
                throw ValidationException::withMessages(['status' => 'Only draft, returned, or cancelled requisitions can be submitted.']);
            }

            // Verify Department Head ownership
            $this->assertDepartmentHeadOwnership($locked, $actor);

            if ((int) $locked->requested_by === $hrManagerId || (int) $actor->id === $hrManagerId) {
                throw ValidationException::withMessages(['hr_manager_id' => 'The requester cannot be their own HR Manager reviewer.']);
            }

            $hrManager = $this->qualifiedApprover($locked, $hrManagerId, 'hr.requisition.hr_manager.decide', 'hr_manager_id');
            $cycleNumber = ((int) $locked->approvalCycles()->max('cycle_number')) + 1;

            $snapshot = $this->snapshot($locked, $hrManager);
            $cycle = $locked->approvalCycles()->create([
                'cycle_number' => $cycleNumber,
                'status' => JobRequisitionApprovalCycle::STATUS_PENDING,
                'snapshot' => $snapshot,
                'submitted_by' => $actor->id,
                'submitted_at' => now(),
            ]);

            $cycle->steps()->createMany([
                [
                    'step_order' => 1,
                    'step_type' => JobRequisitionApprovalStep::TYPE_HR_MANAGER,
                    'assigned_to' => $hrManager->id,
                    'status' => JobRequisitionApprovalStep::STATUS_PENDING,
                ],
                [
                    'step_order' => 2,
                    'step_type' => JobRequisitionApprovalStep::TYPE_DIRECTOR,
                    'assigned_to' => null,
                    'status' => JobRequisitionApprovalStep::STATUS_WAITING,
                ],
            ]);

            $locked->update([
                'status' => 'pending_hr_review',
                'hr_manager_id' => $hrManager->id,
                'hiring_manager_id' => $hrManager->id,
                'current_approval_cycle_id' => $cycle->id,
                'approved_by' => null,
                'approved_at' => null,
            ]);

            $this->notify($hrManager, 'Requisition awaiting your HR review', $locked, $actor);

            return $this->freshWorkflow($locked);
        });
    }

    public function forwardToDirector(JobRequisition $requisition, User $actor, int $directorId, ?string $comment = null): JobRequisition
    {
        return DB::transaction(function () use ($requisition, $actor, $directorId, $comment) {
            $locked = JobRequisition::query()->lockForUpdate()->findOrFail($requisition->id);

            if ($locked->status !== 'pending_hr_review' || ! $locked->current_approval_cycle_id) {
                throw ValidationException::withMessages(['status' => 'This requisition is not awaiting HR Manager review.']);
            }

            if ((int) $locked->hr_manager_id !== (int) $actor->id && ! $actor->isSuperAdmin()) {
                throw ValidationException::withMessages(['reviewer' => 'Only the assigned HR Manager may forward this requisition.']);
            }

            if ((int) $locked->requested_by === $directorId || (int) $actor->id === $directorId) {
                throw ValidationException::withMessages(['director_id' => 'The Director cannot be the requester or the HR Manager.']);
            }

            $director = $this->qualifiedApprover($locked, $directorId, 'hr.requisition.director.decide', 'director_id');
            $cycle = JobRequisitionApprovalCycle::query()->lockForUpdate()->findOrFail($locked->current_approval_cycle_id);

            $hrStep = $cycle->steps()
                ->where('step_type', JobRequisitionApprovalStep::TYPE_HR_MANAGER)
                ->where('status', JobRequisitionApprovalStep::STATUS_PENDING)
                ->lockForUpdate()
                ->firstOrFail();

            $hrStep->update([
                'status' => JobRequisitionApprovalStep::STATUS_APPROVED,
                'comment' => $comment,
                'decided_by' => $actor->id,
                'decided_at' => now(),
            ]);

            $directorStep = $cycle->steps()
                ->where('step_type', JobRequisitionApprovalStep::TYPE_DIRECTOR)
                ->where('status', JobRequisitionApprovalStep::STATUS_WAITING)
                ->first();

            if ($directorStep) {
                $directorStep->update([
                    'assigned_to' => $director->id,
                    'status' => JobRequisitionApprovalStep::STATUS_PENDING,
                ]);
            } else {
                $maxOrder = (int) $cycle->steps()->max('step_order');
                $cycle->steps()->create([
                    'step_order' => $maxOrder + 1,
                    'step_type' => JobRequisitionApprovalStep::TYPE_DIRECTOR,
                    'assigned_to' => $director->id,
                    'status' => JobRequisitionApprovalStep::STATUS_PENDING,
                ]);
            }

            $locked->update([
                'status' => 'pending_director_review',
                'director_id' => $director->id,
            ]);

            $this->notify($director, 'Requisition forwarded for Director approval', $locked, $actor);

            return $this->freshWorkflow($locked);
        });
    }

    public function returnToDepartmentHead(JobRequisition $requisition, User $actor, string $comment): JobRequisition
    {
        return DB::transaction(function () use ($requisition, $actor, $comment) {
            $locked = JobRequisition::query()->lockForUpdate()->findOrFail($requisition->id);

            if (! in_array($locked->status, ['pending_hr_review', 'returned_to_hr'], true) || ! $locked->current_approval_cycle_id) {
                throw ValidationException::withMessages(['status' => 'This requisition cannot be returned to Department Head in its current state.']);
            }

            if ((int) $locked->hr_manager_id !== (int) $actor->id && ! $actor->isSuperAdmin()) {
                throw ValidationException::withMessages(['reviewer' => 'Only the assigned HR Manager may return this requisition.']);
            }

            if (mb_strlen(trim($comment)) < 5) {
                throw ValidationException::withMessages(['comment' => 'A substantive comment of at least 5 characters is required.']);
            }

            $cycle = JobRequisitionApprovalCycle::query()->lockForUpdate()->findOrFail($locked->current_approval_cycle_id);

            $hrStep = $cycle->steps()
                ->where('step_type', JobRequisitionApprovalStep::TYPE_HR_MANAGER)
                ->where('status', JobRequisitionApprovalStep::STATUS_PENDING)
                ->lockForUpdate()
                ->first();

            if ($hrStep) {
                $hrStep->update([
                    'status' => JobRequisitionApprovalStep::STATUS_RETURNED,
                    'comment' => $comment,
                    'decided_by' => $actor->id,
                    'decided_at' => now(),
                ]);
            }

            $cycle->update([
                'status' => 'REVISION_REQUESTED',
                'completed_at' => now(),
            ]);

            $locked->update(['status' => 'revision_requested']);

            $this->notifyRequester($locked, 'Requisition returned for revision', $actor);

            return $this->freshWorkflow($locked);
        });
    }

    public function directorDecision(JobRequisition $requisition, User $actor, string $decision, ?string $comment = null): JobRequisition
    {
        return DB::transaction(function () use ($requisition, $actor, $decision, $comment) {
            $locked = JobRequisition::query()->lockForUpdate()->findOrFail($requisition->id);

            if ($locked->status !== 'pending_director_review' || ! $locked->current_approval_cycle_id) {
                throw ValidationException::withMessages(['status' => 'This requisition is not awaiting Director review.']);
            }

            if ((int) $locked->director_id !== (int) $actor->id && ! $actor->isSuperAdmin()) {
                throw ValidationException::withMessages(['reviewer' => 'Only the assigned Director may decide this requisition.']);
            }

            if ($decision === 'returned' && mb_strlen(trim((string) $comment)) < 5) {
                throw ValidationException::withMessages(['comment' => 'A substantive comment of at least 5 characters is required when returning to HR.']);
            }

            $cycle = JobRequisitionApprovalCycle::query()->lockForUpdate()->findOrFail($locked->current_approval_cycle_id);
            $directorStep = $cycle->steps()
                ->where('step_type', JobRequisitionApprovalStep::TYPE_DIRECTOR)
                ->where('status', JobRequisitionApprovalStep::STATUS_PENDING)
                ->lockForUpdate()
                ->firstOrFail();

            if ($decision === 'approved') {
                $directorStep->update([
                    'status' => JobRequisitionApprovalStep::STATUS_APPROVED,
                    'comment' => $comment,
                    'decided_by' => $actor->id,
                    'decided_at' => now(),
                ]);

                $cycle->update([
                    'status' => JobRequisitionApprovalCycle::STATUS_APPROVED,
                    'completed_at' => now(),
                ]);

                $locked->update([
                    'status' => 'approved',
                    'approved_by' => $actor->id,
                    'approved_at' => now(),
                ]);

                $this->notifyRequester($locked, 'Requisition approved by Director', $actor);
                if ($locked->hrManager) {
                    $this->notify($locked->hrManager, 'Requisition approved by Director', $locked, $actor);
                }
            } else {
                // Director returned to HR Manager
                $directorStep->update([
                    'status' => JobRequisitionApprovalStep::STATUS_RETURNED,
                    'comment' => $comment,
                    'decided_by' => $actor->id,
                    'decided_at' => now(),
                ]);

                $maxOrder = (int) $cycle->steps()->max('step_order');
                $cycle->steps()->create([
                    'step_order' => $maxOrder + 1,
                    'step_type' => JobRequisitionApprovalStep::TYPE_HR_MANAGER,
                    'assigned_to' => $locked->hr_manager_id,
                    'status' => JobRequisitionApprovalStep::STATUS_PENDING,
                ]);

                $locked->update(['status' => 'returned_to_hr']);

                if ($locked->hrManager) {
                    $this->notify($locked->hrManager, 'Requisition returned by Director', $locked, $actor);
                }
            }

            return $this->freshWorkflow($locked);
        });
    }

    public function respondToDirector(JobRequisition $requisition, User $actor, ?string $comment = null): JobRequisition
    {
        return DB::transaction(function () use ($requisition, $actor, $comment) {
            $locked = JobRequisition::query()->lockForUpdate()->findOrFail($requisition->id);

            if ($locked->status !== 'returned_to_hr' || ! $locked->current_approval_cycle_id) {
                throw ValidationException::withMessages(['status' => 'This requisition is not in returned_to_hr state.']);
            }

            if ((int) $locked->hr_manager_id !== (int) $actor->id && ! $actor->isSuperAdmin()) {
                throw ValidationException::withMessages(['reviewer' => 'Only the assigned HR Manager may respond to the Director.']);
            }

            $cycle = JobRequisitionApprovalCycle::query()->lockForUpdate()->findOrFail($locked->current_approval_cycle_id);

            $hrStep = $cycle->steps()
                ->where('step_type', JobRequisitionApprovalStep::TYPE_HR_MANAGER)
                ->where('status', JobRequisitionApprovalStep::STATUS_PENDING)
                ->lockForUpdate()
                ->firstOrFail();

            $hrStep->update([
                'status' => JobRequisitionApprovalStep::STATUS_APPROVED,
                'comment' => $comment,
                'decided_by' => $actor->id,
                'decided_at' => now(),
            ]);

            $maxOrder = (int) $cycle->steps()->max('step_order');
            $cycle->steps()->create([
                'step_order' => $maxOrder + 1,
                'step_type' => JobRequisitionApprovalStep::TYPE_DIRECTOR,
                'assigned_to' => $locked->director_id,
                'status' => JobRequisitionApprovalStep::STATUS_PENDING,
            ]);

            $locked->update(['status' => 'pending_director_review']);

            if ($locked->director) {
                $this->notify($locked->director, 'Requisition re-forwarded by HR Manager', $locked, $actor);
            }

            return $this->freshWorkflow($locked);
        });
    }

    public function withdraw(JobRequisition $requisition, User $actor): JobRequisition
    {
        return DB::transaction(function () use ($requisition, $actor) {
            $locked = JobRequisition::query()->lockForUpdate()->findOrFail($requisition->id);

            if (in_array($locked->status, ['approved', 'published', 'closed'], true)) {
                throw ValidationException::withMessages(['status' => 'Approved or published requisitions cannot be withdrawn.']);
            }

            if (! $locked->current_approval_cycle_id) {
                if (! $actor->isSuperAdmin() && (int) $actor->id !== (int) $locked->requested_by) {
                    throw ValidationException::withMessages(['requester' => 'Only the requester may withdraw this requisition.']);
                }

                $locked->update([
                    'status' => 'draft',
                    'hr_manager_id' => null,
                    'hiring_manager_id' => null,
                    'director_id' => null,
                    'approved_by' => null,
                    'approved_at' => null,
                ]);

                return $this->freshWorkflow($locked);
            }

            $cycle = JobRequisitionApprovalCycle::query()->lockForUpdate()->findOrFail($locked->current_approval_cycle_id);
            if (! $actor->isSuperAdmin() && ! in_array((int) $actor->id, [(int) $locked->requested_by, (int) $cycle->submitted_by], true)) {
                throw ValidationException::withMessages(['requester' => 'Only the requester may withdraw this requisition.']);
            }

            $cycle->steps()->whereIn('status', [
                JobRequisitionApprovalStep::STATUS_WAITING,
                JobRequisitionApprovalStep::STATUS_PENDING,
            ])->update(['status' => JobRequisitionApprovalStep::STATUS_WITHDRAWN]);

            $cycle->update(['status' => JobRequisitionApprovalCycle::STATUS_WITHDRAWN, 'completed_at' => now()]);
            $locked->update(['status' => 'draft', 'approved_by' => null, 'approved_at' => null]);

            return $this->freshWorkflow($locked);
        });
    }

    public function publish(JobRequisition $requisition, User $actor): JobRequisition
    {
        return DB::transaction(function () use ($requisition, $actor) {
            $locked = JobRequisition::query()->lockForUpdate()->findOrFail($requisition->id);

            if ($locked->status !== 'approved') {
                throw ValidationException::withMessages(['status' => 'Only approved requisitions can be published to the Job Portal.']);
            }

            // Validate publication requirements
            $missing = [];
            if (empty(trim((string) $locked->title))) {
                $missing[] = 'title';
            }
            if (empty(trim((string) $locked->description))) {
                $missing[] = 'description';
            }
            if (empty(trim((string) $locked->requirements))) {
                $missing[] = 'requirements';
            }
            if (empty($locked->company_code)) {
                $missing[] = 'company_code';
            }
            if (! $locked->department_id) {
                $missing[] = 'department_id';
            }
            if ((int) $locked->openings < 1) {
                $missing[] = 'openings';
            }

            if ($missing !== []) {
                throw ValidationException::withMessages(['requisition' => 'Missing required fields for publishing: ' . implode(', ', $missing)]);
            }

            $locked->update([
                'status' => 'published',
                'posted_at' => $locked->posted_at ?? now(),
            ]);

            return $this->freshWorkflow($locked);
        });
    }

    public function unpublish(JobRequisition $requisition, User $actor): JobRequisition
    {
        return DB::transaction(function () use ($requisition) {
            $locked = JobRequisition::query()->lockForUpdate()->findOrFail($requisition->id);

            if ($locked->status !== 'published') {
                throw ValidationException::withMessages(['status' => 'Only published requisitions can be unpublished.']);
            }

            $locked->update(['status' => 'approved']);

            return $this->freshWorkflow($locked);
        });
    }

    public function close(JobRequisition $requisition): JobRequisition
    {
        return DB::transaction(function () use ($requisition) {
            $locked = JobRequisition::query()->lockForUpdate()->findOrFail($requisition->id);

            if (in_array($locked->status, ['pending_hr_review', 'pending_director_review', 'returned_to_hr'], true)) {
                throw ValidationException::withMessages(['status' => 'Withdraw a pending requisition before closing it.']);
            }

            $locked->update(['status' => 'closed', 'closed_at' => now()]);

            return $this->freshWorkflow($locked);
        });
    }

    private function assertDepartmentHeadOwnership(JobRequisition $requisition, User $actor): void
    {
        if ($actor->isSuperAdmin()) {
            return;
        }

        // Privileged override check
        $override = $this->authorization->decide($actor, 'hr.requisition.department.override', ['company_code' => $requisition->company_code], ['audit' => false]);
        if ($override->allowed) {
            return;
        }

        // Verify Department Head manages the department
        $department = Department::find($requisition->department_id);
        if ($department) {
            $departmentManagerService = app(\App\Services\Hr\DepartmentManagers::class);
            if ($departmentManagerService->isManagerOf($actor->id, $department)) {
                return;
            }
        }

        if ((int) $requisition->requested_by === (int) $actor->id || (int) $requisition->department_manager_id === (int) $actor->id) {
            return;
        }

        throw ValidationException::withMessages(['department_id' => 'You can only create or submit requisitions for departments you manage.']);
    }

    private function qualifiedApprover(JobRequisition $requisition, int $userId, string $permission, string $field): User
    {
        $user = User::query()->visible()->whereKey($userId)->where('is_deleted', 0)->whereIn('status', ['0', 'ACTIVE'])->first();
        if (! $user) {
            throw ValidationException::withMessages([$field => 'The selected user does not exist or is inactive.']);
        }

        $userTokens = array_map('trim', explode(',', (string) $user->company_code));
        $sameCompany = (
            (bool) array_intersect(['all', 'all-companies'], $userTokens)
            || (bool) array_intersect(
                CompanyMembership::parse($requisition->company_code),
                CompanyMembership::parse($user->company_code),
            )
        );

        $allowed = $this->authorization->decide($user, $permission, $requisition, ['audit' => false])->allowed;
        if (! $allowed && $permission === 'hr.requisition.hr_manager.decide') {
            $allowed = $this->authorization->decide($user, 'hr.requisition.hiring_manager.decide', $requisition, ['audit' => false])->allowed;
        }

        if (! $sameCompany || ! $allowed) {
            throw ValidationException::withMessages([$field => 'The selected user is not an eligible company approver.']);
        }

        return $user;
    }

    private function snapshot(JobRequisition $requisition, User $hrManager): array
    {
        $requisition->loadMissing(['department:id,name', 'departmentManager:id,name,designation', 'requestedBy:id,name,email']);

        return [
            'requisition' => $requisition->only([
                'id', 'title', 'department_id', 'department_manager_id', 'designation', 'employment_type',
                'openings', 'priority', 'min_experience', 'max_experience', 'salary_min', 'salary_max',
                'description', 'requirements', 'company_code', 'unit', 'requested_by', 'target_closing_date',
            ]),
            'department' => $requisition->department?->only(['id', 'name']),
            'department_manager' => $requisition->departmentManager?->only(['id', 'name', 'designation']),
            'requested_by' => $requisition->requestedBy?->only(['id', 'name', 'email']),
            'hr_manager' => $hrManager->only(['id', 'name', 'email', 'designation']),
            'hiring_manager' => $hrManager->only(['id', 'name', 'email', 'designation']),
        ];
    }

    private function freshWorkflow(JobRequisition $requisition): JobRequisition
    {
        return $requisition->fresh([
            'department', 'departmentManager:id,name,designation', 'requestedBy:id,name,email',
            'approvedBy:id,name,email', 'hrManager:id,name,email,designation', 'hiringManager:id,name,email,designation', 'director:id,name,email,designation',
            'currentApprovalCycle.submitter:id,name,email',
            'currentApprovalCycle.steps.assignedUser:id,name,email,designation',
            'currentApprovalCycle.steps.decisionActor:id,name,email,designation',
        ]);
    }

    private function notify(User $recipient, string $title, JobRequisition $requisition, User $actor): void
    {
        if (! Schema::hasTable('notifications')) {
            return;
        }

        Notification::create([
            'user_id' => $recipient->id,
            'title' => $title,
            'description' => $requisition->title,
            'module' => 'Hiring',
            'priority' => $requisition->priority === 'urgent' ? 'high' : 'medium',
            'action_url' => '/admin/hr/hiring',
            'action_label' => 'Review requisition',
            'triggered_by' => $actor->name,
            'related_type' => JobRequisition::class,
            'related_id' => $requisition->id,
        ]);
    }

    private function notifyRequester(JobRequisition $requisition, string $title, User $actor): void
    {
        $requester = $requisition->requestedBy()->first();
        if ($requester) {
            $this->notify($requester, $title, $requisition, $actor);
        }
    }
}
