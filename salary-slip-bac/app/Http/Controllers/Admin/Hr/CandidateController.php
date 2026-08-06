<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateStageHistory;
use Illuminate\Http\Request;

class CandidateController extends Controller
{
    use ScopesCompany;

    private const STAGES = [
        'applied', 'screening', 'shortlisted', 'interview',
        'selected', 'offer_sent', 'offer_accepted', 'rejected', 'on_hold',
    ];

    public function index(Request $request)
    {
        $query = Candidate::with(['requisition', 'recruiter']);
        $this->applyCompanyScope($query, $request);

        if ($request->requisition_id) {
            $query->where('requisition_id', $request->requisition_id);
        }
        if ($request->stage) {
            $query->whereIn('stage', explode(',', $request->stage));
        }
        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('name', 'like', '%' . $request->search . '%')
                  ->orWhere('email', 'like', '%' . $request->search . '%');
            });
        }

        $candidates = $query->orderByDesc('id')->paginate($request->per_page ?? 25);

        return response()->json(['status' => true, 'data' => $candidates]);
    }

    public function pipeline(Request $request)
    {
        $query = Candidate::with(['requisition', 'recruiter']);
        $this->applyCompanyScope($query, $request);
        if ($request->requisition_id) {
            $query->where('requisition_id', $request->requisition_id);
        }

        $candidates = $query->orderByDesc('id')->get();
        $columns = collect(self::STAGES)->mapWithKeys(fn ($stage) => [
            $stage => $candidates->where('stage', $stage)->values(),
        ]);

        return response()->json(['status' => true, 'data' => $columns]);
    }

    public function show($id)
    {
        $candidate = Candidate::with(['requisition', 'recruiter', 'stageHistory.changedBy', 'interviews.panelists.user', 'interviews.feedback', 'offers'])->find($id);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $candidate]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'requisition_id' => 'nullable|exists:job_requisitions,id',
            'name' => 'required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:30',
            'experience_years' => 'nullable|numeric|min:0',
            'current_company' => 'nullable|string|max:255',
            'current_designation' => 'nullable|string|max:255',
            'skills' => 'nullable|array',
            'resume_path' => 'nullable|string',
            'resume_original_name' => 'nullable|string',
            'source' => 'nullable|in:referral,job_portal,linkedin,walk_in,google_form,other',
            'recruiter_id' => 'nullable|exists:users,id',
            'priority' => 'nullable|in:low,medium,high',
            'notes' => 'nullable|string',
        ]);

        $context = $this->defaultCompanyContext($request);
        $candidate = Candidate::create($data + [
            'stage' => 'applied',
            'company_code' => $context['company_code'],
            'unit' => $context['unit'],
            'created_by' => auth('api')->id(),
        ]);

        CandidateStageHistory::create([
            'candidate_id' => $candidate->id,
            'from_stage' => null,
            'to_stage' => 'applied',
            'changed_by' => auth('api')->id(),
            'created_at' => now(),
        ]);

        return response()->json(['status' => true, 'message' => 'Candidate added', 'data' => $candidate], 201);
    }

    public function update(Request $request, $id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $data = $request->validate([
            'requisition_id' => 'nullable|exists:job_requisitions,id',
            'name' => 'sometimes|required|string|max:255',
            'email' => 'nullable|email|max:255',
            'phone' => 'nullable|string|max:30',
            'experience_years' => 'nullable|numeric|min:0',
            'current_company' => 'nullable|string|max:255',
            'current_designation' => 'nullable|string|max:255',
            'skills' => 'nullable|array',
            'source' => 'nullable|in:referral,job_portal,linkedin,walk_in,google_form,other',
            'recruiter_id' => 'nullable|exists:users,id',
            'priority' => 'nullable|in:low,medium,high',
            'rating' => 'nullable|numeric|min:0|max:5',
            'notes' => 'nullable|string',
        ]);

        $candidate->update($data);

        return response()->json(['status' => true, 'message' => 'Candidate updated', 'data' => $candidate]);
    }

    public function destroy($id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $candidate->delete();

        return response()->json(['status' => true, 'message' => 'Candidate deleted']);
    }

    public function moveStage(Request $request, $id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $data = $request->validate([
            'to_stage' => 'required|in:' . implode(',', self::STAGES),
            'notes' => 'nullable|string',
        ]);

        $fromStage = $candidate->stage;
        $candidate->update(['stage' => $data['to_stage']]);

        CandidateStageHistory::create([
            'candidate_id' => $candidate->id,
            'from_stage' => $fromStage,
            'to_stage' => $data['to_stage'],
            'changed_by' => auth('api')->id(),
            'notes' => $data['notes'] ?? null,
            'created_at' => now(),
        ]);

        return response()->json(['status' => true, 'message' => 'Candidate stage updated', 'data' => $candidate]);
    }
}
