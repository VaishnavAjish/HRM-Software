<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\JobRequisition;
use App\Models\JobRequisitionApprovalStep;
use App\Services\Hr\DepartmentManagers;
use App\Services\Hr\JobRequisitionApprovalService;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class JobRequisitionController extends Controller
{
    use ScopesCompany;

    public function index(Request $request)
    {
        $query = JobRequisition::with([
            'department', 'departmentManager:id,name,designation', 'requestedBy:id,name,email',
            'approvedBy:id,name,email', 'hiringManager:id,name,email,designation', 'director:id,name,email,designation',
            'currentApprovalCycle.steps.assignedUser:id,name,email,designation',
            'currentApprovalCycle.steps.decisionActor:id,name,email,designation',
        ])
            ->withCount('candidates');
        $this->applyCompanyScope($query, $request);

        if ($request->status) {
            $query->whereIn('status', explode(',', $request->status));
        }
        if ($request->department_id) {
            $query->where('department_id', $request->department_id);
        }
        if ($request->search) {
            $query->where('title', 'like', '%' . $request->search . '%');
        }

        $requisitions = $query->orderByDesc('id')->paginate($request->per_page ?? 25);

        return response()->json(['status' => true, 'data' => $requisitions]);
    }

    public function show(Request $request, $id)
    {
        $requisition = $this->scopedRequisition($request, $id, [
            'department', 'departmentManager:id,name,designation', 'requestedBy:id,name,email',
            'approvedBy:id,name,email', 'hiringManager:id,name,email,designation', 'director:id,name,email,designation',
            'currentApprovalCycle.submitter:id,name,email',
            'currentApprovalCycle.steps.assignedUser:id,name,email,designation',
            'currentApprovalCycle.steps.decisionActor:id,name,email,designation', 'candidates',
        ]);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $requisition]);
    }

    public function departmentManagers(Request $request, $id, DepartmentManagers $managers)
    {
        $department = Department::find($id);
        if (!$department) {
            return response()->json(['status' => false, 'message' => 'Department not found'], 404);
        }

        $data = $managers->managersFor($department, fn ($q) => $this->applyCompanyScope($q, $request))
            ->map(fn ($u) => ['id' => $u->id, 'name' => $u->name, 'designation' => $u->designation]);

        return response()->json(['status' => true, 'data' => $data->values()]);
    }

    public function store(Request $request, DepartmentManagers $managers)
    {
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'department_id' => 'required|integer|exists:departments,id',
            'department_manager_id' => 'required|integer|exists:users,id',
            'designation' => 'nullable|string|max:255',
            'employment_type' => 'nullable|in:full_time,part_time,contract,intern',
            'openings' => 'nullable|integer|min:1',
            'priority' => 'nullable|in:low,medium,high,urgent',
            'min_experience' => 'nullable|numeric|min:0',
            'max_experience' => 'nullable|numeric|min:0',
            'salary_min' => 'nullable|numeric|min:0',
            'salary_max' => 'nullable|numeric|min:0',
            'description' => 'nullable|string',
            'requirements' => 'nullable|string',
            'target_closing_date' => 'nullable|date',
        ]);

        $this->assertRangesAreOrdered($data);
        $this->assertManagerLeadsDepartment($request, (int) $data['department_id'], (int) $data['department_manager_id'], $managers);

        $context = $this->defaultCompanyContext($request);
        $requisition = JobRequisition::create($data + [
            'status' => 'draft',
            'company_code' => $context['company_code'],
            'unit' => $context['unit'],
            'requested_by' => auth('api')->id(),
        ]);

        return response()->json(['status' => true, 'message' => 'Requisition created', 'data' => $requisition], 201);
    }

    public function update(Request $request, $id, DepartmentManagers $managers)
    {
        $requisition = $this->scopedRequisition($request, $id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        if (! in_array($requisition->status, ['draft', 'rejected'], true)) {
            throw ValidationException::withMessages([
                'status' => 'Only draft or rejected requisitions can be edited.',
            ]);
        }
        if ($request->exists('status')) {
            throw ValidationException::withMessages([
                'status' => 'Use the dedicated submit, withdraw, close, or approval decision endpoint.',
            ]);
        }

        $data = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'department_id' => 'sometimes|required|integer|exists:departments,id',
            'department_manager_id' => 'sometimes|required|integer|exists:users,id',
            'designation' => 'nullable|string|max:255',
            'employment_type' => 'nullable|in:full_time,part_time,contract,intern',
            'openings' => 'nullable|integer|min:1',
            'priority' => 'nullable|in:low,medium,high,urgent',
            'min_experience' => 'nullable|numeric|min:0',
            'max_experience' => 'nullable|numeric|min:0',
            'salary_min' => 'nullable|numeric|min:0',
            'salary_max' => 'nullable|numeric|min:0',
            'description' => 'nullable|string',
            'requirements' => 'nullable|string',
            'target_closing_date' => 'nullable|date',
        ]);

        $this->assertRangesAreOrdered(array_merge(
            $requisition->only(['min_experience', 'max_experience', 'salary_min', 'salary_max']),
            $data,
        ));

        $departmentChanged = array_key_exists('department_id', $data)
            && (int) $data['department_id'] !== (int) $requisition->department_id;
        $managerProvided = array_key_exists('department_manager_id', $data);

        if ($departmentChanged || $managerProvided) {
            $targetDepartment = (int) ($data['department_id'] ?? $requisition->department_id);
            $targetManager = (int) ($data['department_manager_id'] ?? $requisition->department_manager_id);
            if (!$targetDepartment || !$targetManager) {
                throw ValidationException::withMessages([
                    'department_manager_id' => 'Department and Department Manager must be set together.',
                ]);
            }
            $this->assertManagerLeadsDepartment($request, $targetDepartment, $targetManager, $managers);
        }

        $requisition->update($data);

        return response()->json(['status' => true, 'message' => 'Requisition updated', 'data' => $requisition]);
    }

    public function destroy(Request $request, $id)
    {
        $requisition = $this->scopedRequisition($request, $id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        if (! in_array($requisition->status, ['draft', 'rejected'], true)
            || $requisition->approvalCycles()->exists()
            || $requisition->candidates()->exists()) {
            throw ValidationException::withMessages([
                'status' => 'Only unused draft requisitions without approval history can be deleted.',
            ]);
        }

        $requisition->delete();

        return response()->json(['status' => true, 'message' => 'Requisition deleted']);
    }

    public function approvalOptions(Request $request, JobRequisitionApprovalService $approvals)
    {
        $data = $request->validate([
            'requisition_id' => 'required|integer',
            'type' => 'nullable|string|in:hr-manager,hiring-manager,director',
            'search' => 'nullable|string|max:100',
        ]);
        $requisition = $this->scopedRequisition($request, $data['requisition_id']);
        if (! $requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $type = match ($data['type'] ?? 'hr-manager') {
            'director' => 'director',
            default => 'hr-manager',
        };

        return response()->json([
            'status' => true,
            'data' => $approvals->eligibleApprovers($requisition, auth('api')->user(), $type, $data['search'] ?? null),
        ]);
    }

    public function hrManagerQueue(Request $request)
    {
        return $this->approvalQueue($request, JobRequisitionApprovalStep::TYPE_HR_MANAGER);
    }

    public function hiringManagerQueue(Request $request)
    {
        return $this->hrManagerQueue($request);
    }

    public function directorQueue(Request $request)
    {
        return $this->approvalQueue($request, JobRequisitionApprovalStep::TYPE_DIRECTOR);
    }

    public function jobPortalQueue(Request $request)
    {
        $data = $request->validate([
            'status' => 'nullable|in:approved,published,closed,all',
            'search' => 'nullable|string|max:100',
            'department_id' => 'nullable|integer',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);

        $query = JobRequisition::with([
            'department', 'departmentManager:id,name,designation', 'requestedBy:id,name,email',
            'approvedBy:id,name,email', 'hrManager:id,name,email,designation', 'director:id,name,email,designation',
        ])->withCount('candidates');

        $this->applyCompanyScope($query, $request);

        $filterStatus = $data['status'] ?? 'approved';
        if ($filterStatus !== 'all') {
            $query->where('status', match ($filterStatus) {
                'published' => 'published',
                'closed' => 'closed',
                default => 'approved',
            });
        } else {
            $query->whereIn('status', ['approved', 'published', 'closed']);
        }

        if (! empty($data['department_id'])) {
            $query->where('department_id', $data['department_id']);
        }

        if (! empty($data['search'])) {
            $search = $data['search'];
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhereHas('department', fn ($d) => $d->where('name', 'like', "%{$search}%"));
            });
        }

        $counts = (clone $query)->reorder()->selectRaw('status, count(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');
        $requisitions = $query->orderByDesc('id')->paginate($data['per_page'] ?? 25);

        return response()->json([
            'status' => true,
            'data' => $requisitions,
            'counts' => [
                'approved' => (int) ($counts['approved'] ?? 0),
                'published' => (int) ($counts['published'] ?? 0),
                'closed' => (int) ($counts['closed'] ?? 0),
            ],
        ]);
    }

    public function approvalHistory(Request $request, $id)
    {
        $requisition = $this->scopedRequisition($request, $id, [
            'approvalCycles.submitter:id,name,email',
            'approvalCycles.steps.assignedUser:id,name,email,designation',
            'approvalCycles.steps.decisionActor:id,name,email,designation',
        ]);
        if (! $requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $requisition->approvalCycles]);
    }

    public function submit(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        $data = $request->validate([
            'hr_manager_id' => 'nullable|integer',
            'hiring_manager_id' => 'nullable|integer',
        ]);

        $hrManagerId = (int) ($data['hr_manager_id'] ?? $data['hiring_manager_id'] ?? 0);
        if (! $hrManagerId) {
            throw ValidationException::withMessages(['hr_manager_id' => 'An HR Manager reviewer must be selected.']);
        }

        $requisition = $this->scopedRequisition($request, $id);
        if (! $requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $updated = $approvals->submit(
            $requisition,
            auth('api')->user(),
            $hrManagerId,
        );
        AuditLogger::log($request, 'SUBMIT', 'JobRequisitionApproval', $requisition->toArray(), $updated->toArray());

        return response()->json(['status' => true, 'message' => 'Requisition submitted for HR Manager review', 'data' => $updated]);
    }

    public function hrManagerForward(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        $data = $request->validate([
            'director_id' => 'required|integer',
            'comment' => 'nullable|string|max:2000',
        ]);

        $requisition = $this->scopedRequisition($request, $id);
        if (! $requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $updated = $approvals->forwardToDirector(
            $requisition,
            auth('api')->user(),
            (int) $data['director_id'],
            $data['comment'] ?? null,
        );
        AuditLogger::log($request, 'FORWARD', 'JobRequisitionApproval', $requisition->toArray(), $updated->toArray());

        return response()->json(['status' => true, 'message' => 'Requisition forwarded to Director', 'data' => $updated]);
    }

    public function hrManagerReturn(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        $data = $request->validate([
            'comment' => 'required|string|min:5|max:2000',
        ]);

        $requisition = $this->scopedRequisition($request, $id);
        if (! $requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $updated = $approvals->returnToDepartmentHead(
            $requisition,
            auth('api')->user(),
            $data['comment'],
        );
        AuditLogger::log($request, 'RETURN_TO_DEPT_HEAD', 'JobRequisitionApproval', $requisition->toArray(), $updated->toArray());

        return response()->json(['status' => true, 'message' => 'Requisition returned to Department Head for revision', 'data' => $updated]);
    }

    public function hrManagerRespond(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        $data = $request->validate([
            'comment' => 'nullable|string|max:2000',
        ]);

        $requisition = $this->scopedRequisition($request, $id);
        if (! $requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $updated = $approvals->respondToDirector(
            $requisition,
            auth('api')->user(),
            $data['comment'] ?? null,
        );
        AuditLogger::log($request, 'RESPOND_TO_DIRECTOR', 'JobRequisitionApproval', $requisition->toArray(), $updated->toArray());

        return response()->json(['status' => true, 'message' => 'Requisition re-forwarded to Director', 'data' => $updated]);
    }

    public function withdraw(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        $requisition = $this->scopedRequisition($request, $id);
        if (! $requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $updated = $approvals->withdraw($requisition, auth('api')->user());
        AuditLogger::log($request, 'WITHDRAW', 'JobRequisitionApproval', $requisition->toArray(), $updated->toArray());

        return response()->json(['status' => true, 'message' => 'Requisition withdrawn to draft', 'data' => $updated]);
    }

    public function hiringManagerDecision(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        return $this->hrManagerForward($request, $id, $approvals);
    }

    public function directorDecision(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        $data = $request->validate([
            'decision' => 'required|in:approved,returned,rejected',
            'comment' => 'nullable|string|max:2000|required_if:decision,returned|required_if:decision,rejected|min:5',
        ]);
        $requisition = $this->scopedRequisition($request, $id);
        if (! $requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $updated = $approvals->directorDecision(
            $requisition,
            auth('api')->user(),
            $data['decision'],
            $data['comment'] ?? null,
        );
        AuditLogger::log($request, strtoupper($data['decision']), 'JobRequisitionApproval', $requisition->toArray(), $updated->toArray());

        return response()->json([
            'status' => true,
            'message' => $data['decision'] === 'approved' ? 'Requisition approved by Director' : 'Requisition returned to HR Manager',
            'data' => $updated,
        ]);
    }

    public function close(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        $requisition = $this->scopedRequisition($request, $id);
        if (! $requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $updated = $approvals->close($requisition);
        AuditLogger::log($request, 'CLOSE', 'JobRequisition', $requisition->toArray(), $updated->toArray());

        return response()->json(['status' => true, 'message' => 'Requisition closed', 'data' => $updated]);
    }

    public function approve(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        $requisition = $this->scopedRequisition($request, $id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $updated = $approvals->decideLegacy($requisition, auth('api')->user(), $request->input('comment'));
        AuditLogger::log($request, 'APPROVE', 'JobRequisitionApproval', $requisition->toArray(), $updated->toArray());

        return response()->json(['status' => true, 'message' => 'Approval step completed', 'data' => $updated]);
    }

    public function portalPublish(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        $requisition = $this->scopedRequisition($request, $id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $updated = $approvals->publish($requisition, auth('api')->user());
        AuditLogger::log($request, 'PORTAL_PUBLISH', 'JobRequisition', $requisition->toArray(), $updated->toArray());

        return response()->json(['status' => true, 'message' => 'Job published to portal', 'data' => $updated]);
    }

    public function portalUnpublish(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        $requisition = $this->scopedRequisition($request, $id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $updated = $approvals->unpublish($requisition, auth('api')->user());
        AuditLogger::log($request, 'PORTAL_UNPUBLISH', 'JobRequisition', $requisition->toArray(), $updated->toArray());

        return response()->json(['status' => true, 'message' => 'Job unpublished', 'data' => $updated]);
    }

    public function publish(Request $request, $id, JobRequisitionApprovalService $approvals)
    {
        return $this->portalPublish($request, $id, $approvals);
    }

    public function publishToIndeed(Request $request, $id, \App\Services\IndeedJobService $indeedService)
    {
        $requisition = $this->scopedRequisition($request, $id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }
        if ($requisition->status !== 'approved') {
            return response()->json(['status' => false, 'message' => 'Only approved requisitions can be posted'], 422);
        }

        $result = $indeedService->publishJob($requisition, $request->all());

        if ($result['success']) {
            $requisition->update([
                'status' => 'posted',
                'indeed_job_id' => $result['indeed_job_id'],
                'published_to_indeed' => true,
                'published_to_indeed_at' => now(),
                'posted_at' => $requisition->posted_at ?? now(),
            ]);

            return response()->json([
                'status' => true,
                'message' => $result['message'],
                'data' => $requisition->fresh(),
            ]);
        }

        return response()->json(['status' => false, 'message' => 'Could not publish job to Indeed'], 500);
    }

    private function scopedRequisition(Request $request, $id, array $with = []): ?JobRequisition
    {
        $query = JobRequisition::with($with)->where('id', $id);
        $this->applyCompanyScope($query, $request);

        return $query->first();
    }

    private function approvalQueue(Request $request, string $stepType)
    {
        $data = $request->validate([
            'status' => 'nullable|in:awaiting,approved,rejected,all',
            'search' => 'nullable|string|max:100',
            'per_page' => 'nullable|integer|min:1|max:100',
        ]);
        $status = $data['status'] ?? 'awaiting';
        $query = JobRequisitionApprovalStep::query()
            ->where('assigned_to', auth('api')->id())
            ->where('step_type', $stepType)
            ->with([
                'assignedUser:id,name,email,designation', 'decisionActor:id,name,email,designation',
                'cycle.submitter:id,name,email', 'cycle.steps.assignedUser:id,name,email,designation',
                'cycle.steps.decisionActor:id,name,email,designation',
                'cycle.requisition.department', 'cycle.requisition.departmentManager:id,name,designation',
                'cycle.requisition.requestedBy:id,name,email', 'cycle.requisition.hiringManager:id,name,email,designation',
                'cycle.requisition.director:id,name,email,designation',
            ])
            ->whereHas('cycle.requisition', function ($q) use ($request, $data) {
                $this->applyCompanyScope($q, $request);
                if (! empty($data['search'])) {
                    $search = $data['search'];
                    $q->where(function ($nested) use ($search) {
                        $nested->where('title', 'like', "%{$search}%")
                            ->orWhereHas('department', fn ($department) => $department->where('name', 'like', "%{$search}%"))
                            ->orWhereHas('requestedBy', fn ($requester) => $requester->where('name', 'like', "%{$search}%"));
                    });
                }
            });

        $counts = (clone $query)->selectRaw('status, count(*) as aggregate')->groupBy('status')->pluck('aggregate', 'status');
        if ($status !== 'all') {
            $query->where('status', match ($status) {
                'approved' => JobRequisitionApprovalStep::STATUS_APPROVED,
                'rejected' => JobRequisitionApprovalStep::STATUS_REJECTED,
                default => JobRequisitionApprovalStep::STATUS_PENDING,
            });
        }

        $steps = $query->orderByDesc('id')->paginate($data['per_page'] ?? 20);

        return response()->json([
            'status' => true,
            'data' => $steps,
            'counts' => [
                'awaiting' => (int) ($counts[JobRequisitionApprovalStep::STATUS_PENDING] ?? 0),
                'approved' => (int) ($counts[JobRequisitionApprovalStep::STATUS_APPROVED] ?? 0),
                'rejected' => (int) ($counts[JobRequisitionApprovalStep::STATUS_REJECTED] ?? 0),
            ],
        ]);
    }

    private function approvalDecision(Request $request, $id, string $stepType, JobRequisitionApprovalService $approvals)
    {
        $data = $request->validate([
            'decision' => 'required|in:approved,rejected',
            'comment' => 'nullable|string|max:2000|required_if:decision,rejected|min:5',
        ]);
        $requisition = $this->scopedRequisition($request, $id);
        if (! $requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $updated = $approvals->decide(
            $requisition,
            auth('api')->user(),
            $stepType,
            $data['decision'],
            $data['comment'] ?? null,
        );
        AuditLogger::log($request, strtoupper($data['decision']), 'JobRequisitionApproval', $requisition->toArray(), $updated->toArray());

        return response()->json([
            'status' => true,
            'message' => $data['decision'] === 'approved' ? 'Requisition approval recorded' : 'Requisition rejected',
            'data' => $updated,
        ]);
    }

    private function assertRangesAreOrdered(array $data): void
    {
        if (isset($data['min_experience'], $data['max_experience'])
            && (float) $data['max_experience'] < (float) $data['min_experience']) {
            throw ValidationException::withMessages([
                'max_experience' => 'Max experience must be greater than or equal to min experience.',
            ]);
        }
        if (isset($data['salary_min'], $data['salary_max'])
            && (float) $data['salary_max'] < (float) $data['salary_min']) {
            throw ValidationException::withMessages([
                'salary_max' => 'Salary max must be greater than or equal to salary min.',
            ]);
        }
    }

    private function assertManagerLeadsDepartment(Request $request, int $departmentId, int $managerId, DepartmentManagers $managers): void
    {
        $department = Department::find($departmentId);
        if (!$department || !$managers->isManagerOf($managerId, $department, fn ($q) => $this->applyCompanyScope($q, $request))) {
            throw ValidationException::withMessages([
                'department_manager_id' => 'The selected user is not an active manager of the selected department.',
            ]);
        }
    }
}
