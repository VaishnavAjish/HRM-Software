<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\JobRequisition;
use Illuminate\Http\Request;

class JobRequisitionController extends Controller
{
    use ScopesCompany;

    public function index(Request $request)
    {
        $query = JobRequisition::with(['department', 'requestedBy', 'approvedBy'])
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

    public function show($id)
    {
        $requisition = JobRequisition::with(['department', 'requestedBy', 'approvedBy', 'candidates'])->find($id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $requisition]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'title' => 'required|string|max:255',
            'department_id' => 'nullable|exists:departments,id',
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

        $context = $this->defaultCompanyContext($request);
        $requisition = JobRequisition::create($data + [
            'status' => 'draft',
            'company_code' => $context['company_code'],
            'unit' => $context['unit'],
            'requested_by' => auth('api')->id(),
        ]);

        return response()->json(['status' => true, 'message' => 'Requisition created', 'data' => $requisition], 201);
    }

    public function update(Request $request, $id)
    {
        $requisition = JobRequisition::find($id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $data = $request->validate([
            'title' => 'sometimes|required|string|max:255',
            'department_id' => 'nullable|exists:departments,id',
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

        $requisition->update($data);

        return response()->json(['status' => true, 'message' => 'Requisition updated', 'data' => $requisition]);
    }

    public function destroy($id)
    {
        $requisition = JobRequisition::find($id);
        if (!$requisition) {
            return response()->json(['status' => false, 'message' => 'Requisition not found'], 404);
        }

        $requisition->delete();

        return response()->json(['status' => true, 'message' => 'Requisition deleted']);
    }

    public function approve($id)
    {
        $requisition = JobRequisition::find($id);
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

    public function publish($id)
    {
        $requisition = JobRequisition::find($id);
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
        $requisition = JobRequisition::find($id);
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
}
