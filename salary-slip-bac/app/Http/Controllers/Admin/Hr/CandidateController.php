<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\CandidateStageHistory;
use App\Services\Recruitment\AtsScoringService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class CandidateController extends Controller
{
    use ScopesCompany;

    private const STAGES = [
        'applied', 'screening', 'shortlisted', 'assessment', 'interview',
        'selected', 'offer_sent', 'offer_accepted', 'rejected', 'on_hold',
    ];

    public function __construct(
        private readonly AtsScoringService $atsScoring,
    ) {
    }

    /**
     * Best-effort: a scoring failure (bad resume file, unparseable format)
     * must never block creating/updating the candidate record itself, the
     * same pattern this controller's siblings use for mail delivery.
     */
    private function scoreCandidateBestEffort(Candidate $candidate): void
    {
        try {
            $this->atsScoring->score($candidate->fresh());
        } catch (\Throwable $e) {
            Log::warning('ats_scoring_failed', ['candidate_id' => $candidate->id, 'error' => $e->getMessage()]);
        }
    }

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

        $candidates = $query->orderByDesc('ats_score')->orderByDesc('id')->paginate($request->per_page ?? 25);

        return response()->json(['status' => true, 'data' => $candidates]);
    }

    public function pipeline(Request $request)
    {
        $query = Candidate::with(['requisition', 'recruiter']);
        $this->applyCompanyScope($query, $request);
        if ($request->requisition_id) {
            $query->where('requisition_id', $request->requisition_id);
        }

        $candidates = $query->orderByDesc('ats_score')->orderByDesc('id')->get();
        $columns = collect(self::STAGES)->mapWithKeys(fn ($stage) => [
            $stage => $candidates->where('stage', $stage)->values(),
        ]);

        return response()->json(['status' => true, 'data' => $columns]);
    }

    public function show($id)
    {
        $candidate = Candidate::with(['requisition', 'recruiter', 'stageHistory.changedBy', 'interviews.panelists.user', 'interviews.feedback', 'offers'])->find($id);
        if (!$candidate || !$this->candidateWithinActorScope($candidate)) {
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
            'ats_score' => 'nullable|numeric|min:0|max:100',
        ]);

        $context = $this->defaultCompanyContext($request);
        $candidate = Candidate::create($data + [
            'stage' => 'applied',
            'company_code' => $context['company_code'],
            'unit' => $context['unit'],
            'created_by' => auth('api')->id(),
            'ats_score_source' => array_key_exists('ats_score', $data) ? 'manual' : null,
        ]);

        CandidateStageHistory::create([
            'candidate_id' => $candidate->id,
            'from_stage' => null,
            'to_stage' => 'applied',
            'changed_by' => auth('api')->id(),
            'created_at' => now(),
        ]);

        // An explicit manual score is an intentional HR override — don't
        // silently replace it with a computed one. Otherwise, score now so
        // the candidate shows a real match the moment they appear in the list.
        if (!array_key_exists('ats_score', $data)) {
            $this->scoreCandidateBestEffort($candidate);
        }

        return response()->json(['status' => true, 'message' => 'Candidate added', 'data' => $candidate->fresh()], 201);
    }

    public function update(Request $request, $id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate || !$this->candidateWithinActorScope($candidate)) {
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
            'ats_score' => 'nullable|numeric|min:0|max:100',
            'notes' => 'nullable|string',
        ]);

        if (array_key_exists('ats_score', $data)) {
            $data['ats_score_source'] = 'manual';
        }

        $candidate->update($data);

        // Requisition or skills/experience changed — the existing score, if
        // any, may now be stale. Only auto-rescore when nobody just supplied
        // a manual override in this same request.
        if (!array_key_exists('ats_score', $data) && array_intersect(
            array_keys($data), ['requisition_id', 'skills', 'experience_years']
        )) {
            $this->scoreCandidateBestEffort($candidate);
        }

        return response()->json(['status' => true, 'message' => 'Candidate updated', 'data' => $candidate->fresh()]);
    }

    /**
     * Recompute the ATS score on demand — e.g. after HR edits the linked
     * requisition's requirements, or after fixing a resume upload that
     * failed to parse the first time.
     */
    public function rescore($id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate || !$this->candidateWithinActorScope($candidate)) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        if (!$candidate->requisition_id) {
            return response()->json([
                'status' => false,
                'message' => 'This candidate is not linked to a requisition, so there is nothing to score against.',
            ], 422);
        }

        $breakdown = $this->atsScoring->score($candidate);

        return response()->json(['status' => true, 'message' => 'ATS score recomputed', 'data' => $candidate->fresh(), 'breakdown' => $breakdown]);
    }

    public function destroy($id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate || !$this->candidateWithinActorScope($candidate)) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $candidate->delete();

        return response()->json(['status' => true, 'message' => 'Candidate deleted']);
    }

    public function moveStage(Request $request, $id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate || !$this->candidateWithinActorScope($candidate)) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $data = $request->validate([
            'to_stage' => 'required|in:' . implode(',', self::STAGES),
            'notes' => 'nullable|string',
            'rejection_reason' => $request->to_stage === 'rejected' ? 'required|string|max:500' : 'nullable|string|max:500',
        ]);

        $fromStage = $candidate->stage;
        $candidate->update([
            'stage' => $data['to_stage'],
            // Cleared on any move that isn't a rejection, so a later
            // rejection can't accidentally inherit a stale reason from a
            // previous rejection/un-reject cycle.
            'rejection_reason' => $data['to_stage'] === 'rejected' ? $data['rejection_reason'] : null,
        ]);

        CandidateStageHistory::create([
            'candidate_id' => $candidate->id,
            'from_stage' => $fromStage,
            'to_stage' => $data['to_stage'],
            'changed_by' => auth('api')->id(),
            'notes' => $data['to_stage'] === 'rejected' ? $data['rejection_reason'] : ($data['notes'] ?? null),
            'created_at' => now(),
        ]);

        return response()->json(['status' => true, 'message' => 'Candidate stage updated', 'data' => $candidate]);
    }

    /**
     * Stream candidate resume directly with inline headers and iframe permission headers.
     */
    protected function candidateWithinActorScope(Candidate $candidate): bool
    {
        return $this->companyCodeWithinActorScope($candidate->company_code);
    }

    public function resume($id)
    {
        $candidate = Candidate::find($id);
        if (!$candidate || !$candidate->resume_path) {
            return response()->json(['status' => false, 'message' => 'Resume not found for candidate'], 404);
        }

        if (! $this->candidateWithinActorScope($candidate)) {
            return response()->json(['status' => false, 'message' => 'Resume not found for candidate'], 404);
        }

        $path = $candidate->resume_path;

        // If path is already a full URL or data URI
        if (filter_var($path, FILTER_VALIDATE_URL)) {
            return redirect($path);
        }

        $cleanPath = ltrim(str_replace('..', '', preg_replace('/^\/?(storage\/)?/i', '', $path)), '/');

        // Search disk locations
        $possiblePaths = [
            storage_path('app/public/' . $cleanPath),
            storage_path('app/' . $cleanPath),
            storage_path('app/public/candidate-documents/' . basename($cleanPath)),
            storage_path('app/candidate-documents/' . basename($cleanPath)),
            public_path('storage/' . $cleanPath),
        ];

        foreach ($possiblePaths as $fullPath) {
            if (file_exists($fullPath) && is_file($fullPath)) {
                $ext = strtolower(pathinfo($fullPath, PATHINFO_EXTENSION));
                $mimeType = match ($ext) {
                    'pdf' => 'application/pdf',
                    'doc' => 'application/msword',
                    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    default => mime_content_type($fullPath) ?: 'application/octet-stream',
                };

                $filename = $candidate->resume_original_name ?: basename($fullPath);

                $disposition = request()->has('download') ? 'attachment' : 'inline';
                
                return response()->file($fullPath, [
                    'Content-Type' => $mimeType,
                    'Content-Disposition' => $disposition . '; filename="' . $filename . '"',
                    'X-Content-Type-Options' => 'nosniff',
                ]);
            }
        }

        return response()->json(['status' => false, 'message' => 'Resume file not found on disk'], 404);
    }
}
