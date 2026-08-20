<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Mail\InterviewScheduledMail;
use App\Models\Candidate;
use App\Models\Interview;
use App\Models\InterviewFeedback;
use App\Models\InterviewPanelist;
use App\Services\Authorization\SchemaSupport;
use App\Services\Recruitment\GoogleMeetService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class InterviewController extends Controller
{
    use ScopesCompany;

    public function __construct(
        private readonly GoogleMeetService $googleMeet,
    ) {
    }

    /**
     * Best-effort: a Google API failure must never block scheduling the
     * interview itself. Records an honest status either way — "not
     * configured" and "failed" are shown distinctly in the UI rather than
     * both collapsing into a missing meeting_link.
     */
    private function syncGoogleMeetBestEffort(Interview $interview, bool $isReschedule): void
    {
        if ($interview->mode !== 'video') {
            return;
        }

        if (!$this->googleMeet->isConfigured()) {
            $interview->forceFill(['meeting_status' => 'not_configured'])->saveQuietly();
            return;
        }

        try {
            $isReschedule
                ? $this->googleMeet->updateMeetingTime($interview)
                : $this->googleMeet->createMeeting($interview);
        } catch (\Throwable $e) {
            Log::warning('google_meet_sync_failed', ['interview_id' => $interview->id, 'error' => $e->getMessage()]);
            $interview->forceFill([
                'meeting_status' => 'failed',
                'meeting_error' => Str::limit($e->getMessage(), 490),
            ])->saveQuietly();
        }
    }

    public function index(Request $request)
    {
        try {
            if (!SchemaSupport::hasTable('interviews')) {
                return response()->json([
                    'status' => true,
                    'data' => [
                        'data' => [],
                        'total' => 0,
                        'per_page' => (int) ($request->per_page ?? 25),
                        'current_page' => 1,
                        'last_page' => 1,
                    ],
                ]);
            }

            $query = Interview::query();

            $with = [];
            if (SchemaSupport::hasTable('candidates')) {
                $with[] = 'candidate';
            }
            if (SchemaSupport::hasTable('job_requisitions')) {
                $with[] = 'requisition';
            }
            if (SchemaSupport::hasTable('interview_panelists')) {
                $with[] = 'panelists.user';
            }
            if (SchemaSupport::hasTable('interview_feedback')) {
                $with[] = 'feedback';
            }

            $query->with($with);

            $userAuth = auth('api')->user();
            if ($this->hasGlobalCompanyScope($userAuth)) {
                if ($request->company_code && !in_array($request->company_code, ['all', 'all-companies'])) {
                    if (SchemaSupport::hasTable('candidates')) {
                        $query->whereHas('candidate', fn ($q) => $this->applyCompanyScope($q, $request));
                    }
                }
            } else {
                if (SchemaSupport::hasTable('candidates')) {
                    $query->whereHas('candidate', fn ($q) => $this->applyCompanyScope($q, $request));
                }
            }

            if ($request->candidate_id) {
                $query->where('candidate_id', $request->candidate_id);
            }
            if ($request->status) {
                $query->whereIn('status', explode(',', $request->status));
            }
            if ($request->date) {
                $query->whereDate('scheduled_at', $request->date);
            }

            $perPage = max(1, min((int) ($request->per_page ?? 25), 200));
            $interviews = $query->orderByDesc('id')->paginate($perPage);

            return response()->json(['status' => true, 'data' => $interviews->toArray()]);
        } catch (\Throwable $e) {
            Log::error('interview_index_failed', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
            return response()->json([
                'status' => true,
                'data' => [
                    'data' => [],
                    'total' => 0,
                    'per_page' => max(1, min((int) ($request->per_page ?? 25), 200)),
                    'current_page' => 1,
                    'last_page' => 1,
                ],
                'message' => $e->getMessage(),
            ]);
        }
    }

    public function show($id)
    {
        $interview = Interview::with(['candidate', 'requisition', 'panelists.user', 'feedback.panelist'])->find($id);
        if (!$interview || !$this->interviewWithinActorScope($interview)) {
            return response()->json(['status' => false, 'message' => 'Interview not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $interview]);
    }

    protected function interviewWithinActorScope(Interview $interview): bool
    {
        return $this->companyCodeWithinActorScope($interview->candidate?->company_code);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'candidate_id' => 'required|exists:candidates,id',
            'requisition_id' => 'nullable|exists:job_requisitions,id',
            'round_name' => 'required|string|max:100',
            'scheduled_at' => 'required|date',
            'duration_minutes' => 'nullable|integer|min:5',
            'mode' => 'nullable|in:onsite,video,phone',
            'meeting_link' => 'nullable|string|max:500',
            'notes' => 'nullable|string',
            'panelist_ids' => 'nullable|array',
            'panelist_ids.*' => 'exists:users,id',
            'lead_panelist_id' => 'nullable|exists:users,id',
        ]);

        $candidate = Candidate::find($data['candidate_id']);
        if (!$candidate || !$this->companyCodeWithinActorScope($candidate->company_code)) {
            return response()->json(['status' => false, 'message' => 'Candidate not found'], 404);
        }

        $hasManualLink = !empty($data['meeting_link']);

        $interview = Interview::create([
            'candidate_id' => $data['candidate_id'],
            'requisition_id' => $data['requisition_id'] ?? null,
            'round_name' => $data['round_name'],
            'scheduled_at' => $data['scheduled_at'],
            'duration_minutes' => $data['duration_minutes'] ?? 30,
            'mode' => $data['mode'] ?? 'video',
            'meeting_link' => $data['meeting_link'] ?? null,
            'meeting_status' => $hasManualLink ? 'manual' : null,
            'status' => 'scheduled',
            'notes' => $data['notes'] ?? null,
            'created_by' => auth('api')->id(),
        ]);

        foreach ($data['panelist_ids'] ?? [] as $userId) {
            InterviewPanelist::create([
                'interview_id' => $interview->id,
                'user_id' => $userId,
                'is_lead' => $userId == ($data['lead_panelist_id'] ?? null),
            ]);
        }

        $interview->load(['panelists.user', 'candidate.requisition', 'requisition']);

        // A manually-supplied link (e.g. Zoom) is respected as-is — only
        // create a real Google Meet when nobody already gave us a link.
        if (!$hasManualLink) {
            $this->syncGoogleMeetBestEffort($interview, isReschedule: false);
        }

        $this->sendScheduleMail($interview->fresh(['panelists.user', 'candidate.requisition', 'requisition']), isReschedule: false);

        return response()->json(['status' => true, 'message' => 'Interview scheduled', 'data' => $interview->fresh(['panelists.user', 'candidate.requisition', 'requisition'])], 201);
    }

    public function update(Request $request, $id)
    {
        $interview = Interview::with('candidate')->find($id);
        if (!$interview || !$this->interviewWithinActorScope($interview)) {
            return response()->json(['status' => false, 'message' => 'Interview not found'], 404);
        }

        $data = $request->validate([
            'round_name' => 'sometimes|required|string|max:100',
            'scheduled_at' => 'sometimes|required|date',
            'duration_minutes' => 'nullable|integer|min:5',
            'mode' => 'nullable|in:onsite,video,phone',
            'meeting_link' => 'nullable|string|max:500',
            'status' => 'nullable|in:scheduled,completed,cancelled,rescheduled,no_show',
            'notes' => 'nullable|string',
        ]);

        $interview->update($data);

        return response()->json(['status' => true, 'message' => 'Interview updated', 'data' => $interview]);
    }

    public function reschedule(Request $request, $id)
    {
        $interview = Interview::with('candidate')->find($id);
        if (!$interview || !$this->interviewWithinActorScope($interview)) {
            return response()->json(['status' => false, 'message' => 'Interview not found'], 404);
        }

        $data = $request->validate(['scheduled_at' => 'required|date']);
        $interview->update(['scheduled_at' => $data['scheduled_at'], 'status' => 'rescheduled']);

        $interview->load(['candidate.requisition', 'requisition', 'panelists.user']);

        // Only touch Google when we're the ones who created the meeting, or
        // this interview has no manual link at all — never overwrite a
        // manually-supplied link (e.g. Zoom) with a Meet one on reschedule.
        if ($interview->google_event_id || $interview->meeting_status !== 'manual') {
            $this->syncGoogleMeetBestEffort($interview, isReschedule: true);
        }

        $interview = $interview->fresh(['candidate.requisition', 'requisition', 'panelists.user']);
        $this->sendScheduleMail($interview, isReschedule: true);

        return response()->json(['status' => true, 'message' => 'Interview rescheduled', 'data' => $interview]);
    }

    /** Best-effort — see the identical comment on QuizAttemptController::sendAssessmentInvite. */
    private function sendScheduleMail(Interview $interview, bool $isReschedule): void
    {
        $candidate = $interview->candidate;
        if (!$candidate || !$candidate->email) {
            return;
        }

        try {
            Mail::to($candidate->email)->send(new InterviewScheduledMail(
                candidateName: $candidate->name,
                roleTitle: $interview->requisition?->title ?? $candidate->requisition?->title ?? 'your application',
                roundName: $interview->round_name,
                scheduledAtFormatted: $interview->scheduled_at->format('l, d M Y \a\t h:i A'),
                durationMinutes: $interview->duration_minutes,
                mode: $interview->mode,
                meetingLink: $interview->meeting_link,
                isReschedule: $isReschedule,
            ));
        } catch (\Throwable $e) {
            Log::error('interview_schedule_mail_failed', ['interview_id' => $interview->id, 'error' => $e->getMessage()]);
        }
    }

    public function destroy($id)
    {
        $interview = Interview::with('candidate')->find($id);
        if (!$interview || !$this->interviewWithinActorScope($interview)) {
            return response()->json(['status' => false, 'message' => 'Interview not found'], 404);
        }

        $interview->update(['status' => 'cancelled']);

        if ($interview->google_event_id) {
            try {
                $this->googleMeet->deleteMeeting($interview);
            } catch (\Throwable $e) {
                Log::warning('google_meet_delete_failed', ['interview_id' => $interview->id, 'error' => $e->getMessage()]);
                $interview->forceFill(['meeting_status' => 'delete_failed'])->saveQuietly();
            }
        }

        return response()->json(['status' => true, 'message' => 'Interview cancelled']);
    }

    public function feedback(Request $request, $id)
    {
        $interview = Interview::with('candidate')->find($id);
        if (!$interview || !$this->interviewWithinActorScope($interview)) {
            return response()->json(['status' => false, 'message' => 'Interview not found'], 404);
        }

        $data = $request->validate([
            'panelist_id' => 'nullable|exists:users,id',
            'rating' => 'required|integer|min:1|max:5',
            'recommendation' => 'required|in:strong_yes,yes,no,strong_no',
            'strengths' => 'nullable|string',
            'concerns' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        $panelistId = $data['panelist_id'] ?? auth('api')->id();

        $feedback = InterviewFeedback::updateOrCreate(
            ['interview_id' => $interview->id, 'panelist_id' => $panelistId],
            [
                'rating' => $data['rating'],
                'recommendation' => $data['recommendation'],
                'strengths' => $data['strengths'] ?? null,
                'concerns' => $data['concerns'] ?? null,
                'notes' => $data['notes'] ?? null,
                'submitted_at' => now(),
            ]
        );

        if ($interview->status === 'scheduled') {
            $interview->update(['status' => 'completed']);
        }

        return response()->json(['status' => true, 'message' => 'Feedback submitted', 'data' => $feedback]);
    }
}
