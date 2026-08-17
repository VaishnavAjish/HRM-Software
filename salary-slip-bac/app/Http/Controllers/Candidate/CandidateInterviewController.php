<?php

namespace App\Http\Controllers\Candidate;

use App\Http\Controllers\Controller;
use App\Models\Interview;
use Illuminate\Http\Request;

/**
 * Candidate-facing read-only view onto the existing (admin-authored)
 * `interviews` table. Deliberately narrow: `notes` (recruiter prep notes),
 * `created_by`, `google_event_id`, `meeting_status`/`meeting_error`
 * (internal Google Meet sync diagnostics), panelists, and feedback are
 * never serialized here — those are recruiter/interviewer-only.
 */
class CandidateInterviewController extends Controller
{
    public function index(Request $request)
    {
        $account = $request->user();

        $interviews = Interview::whereHas('candidate', fn ($q) => $q->where('candidate_account_id', $account->id))
            ->with(['candidate:id,requisition_id', 'candidate.requisition:id,title,department_id', 'candidate.requisition.department:id,name'])
            ->orderByDesc('scheduled_at')
            ->get()
            ->map(fn (Interview $interview) => $this->candidateSafeInterview($interview));

        return response()->json(['status' => true, 'data' => $interviews]);
    }

    public function show(Request $request, $id)
    {
        $account = $request->user();

        $interview = Interview::whereHas('candidate', fn ($q) => $q->where('candidate_account_id', $account->id))
            ->where('id', $id)
            ->with(['candidate:id,requisition_id', 'candidate.requisition:id,title,department_id', 'candidate.requisition.department:id,name'])
            ->first();

        if (! $interview) {
            return response()->json(['status' => false, 'message' => 'Interview not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $this->candidateSafeInterview($interview)]);
    }

    private function candidateSafeInterview(Interview $interview): array
    {
        return [
            'id' => $interview->id,
            'round_name' => $interview->round_name,
            'job_title' => $interview->candidate?->requisition?->title ?? 'Position',
            'department_name' => $interview->candidate?->requisition?->department?->name,
            'scheduled_at' => $interview->scheduled_at?->toIso8601String(),
            'duration_minutes' => $interview->duration_minutes,
            'mode' => $interview->mode,
            'meeting_link' => $interview->mode === 'video' ? $interview->meeting_link : null,
            'status' => $interview->status,
        ];
    }
}
