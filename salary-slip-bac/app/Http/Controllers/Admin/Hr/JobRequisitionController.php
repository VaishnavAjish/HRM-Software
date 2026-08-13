<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\JobRequisition;
use App\Services\Hr\DepartmentManagers;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class JobRequisitionController extends Controller
{
    use ScopesCompany;

    public function index(Request $request)
    {
        $query = JobRequisition::with(['department', 'departmentManager:id,name,designation', 'requestedBy', 'approvedBy'])
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
        $requisition = $this->scopedRequisition($request, $id, ['department', 'departmentManager:id,name,designation', 'requestedBy', 'approvedBy', 'candidates']);
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

        $data = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'department_id' => 'sometimes|required|integer|exists:departments,id',
            'department_manager_id' => 'sometimes|required|integer|exists:users,id',
            'designation' => 'nullable|string|max:255',
            'employment_type' => 'nullable|in:full_time,part_time,contract,intern',
            'openings' => 'nullable|integer|min:1',
            'priority' => 'nullable|in:low,medium,high,urgent',
            'status' => 'nullable|in:draft,pending_approval,approved,posted,on_hold,closed,cancelled',
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

        $requisition->delete();

        return response()->json(['status' => true, 'message' => 'Requisition deleted']);
    }

    public function approve(Request $request, $id)
    {
        $requisition = $this->scopedRequisition($request, $id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $requisition->update([
            'status' => 'approved',
            'approved_by' => auth('api')->id(),
            'approved_at' => now(),
        ]);

        return response()->json(['status' => true, 'message' => 'Requisition approved', 'data' => $requisition]);
    }

    public function publish(Request $request, $id)
    {
        $requisition = $this->scopedRequisition($request, $id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }
        if ($requisition->status !== 'approved') {
            return response()->json(['status' => false, 'message' => 'Only approved requisitions can be posted'], 422);
        }

        $requisition->update(['status' => 'posted', 'posted_at' => now()]);

        return response()->json(['status' => true, 'message' => 'Requisition posted', 'data' => $requisition]);
    }

    public function publishToIndeed(Request $request, $id, \App\Services\IndeedJobService $indeedService)
    {
        $requisition = $this->scopedRequisition($request, $id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
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
