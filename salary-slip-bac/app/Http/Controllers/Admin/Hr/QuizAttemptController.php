<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Jobs\SendAssessmentInvitationJob;
use App\Models\Candidate;
use App\Models\QuizAttempt;
use App\Models\TrainingQuiz;
use App\Services\Assessments\AssessmentAudit;
use App\Services\Assessments\AssessmentInviteMailFactory;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * HR-facing side of the interview quiz: assigning a quiz to a candidate,
 * watching results come in, and reading the proctoring trail afterwards.
 * The candidate's own side lives in PublicQuizController — this controller
 * never serves quiz content to a candidate.
 */
class QuizAttemptController extends Controller
{
    use ScopesCompany;

    private const EAGER_LOAD = [
        'quiz:id,title,duration_minutes,passing_score',
        'candidate:id,name,email,requisition_id,company_code,unit',
        'candidate.requisition:id,title,department_id',
        'candidate.requisition.department:id,name',
    ];

    public function index(Request $request)
    {
        $query = QuizAttempt::with(['quiz:id,title,passing_score', 'candidate:id,name,email,stage', 'interview:id,round_name,scheduled_at']);
        $this->applyCompanyScope($query, $request);

        if ($request->quiz_id) {
            $query->where('quiz_id', $request->quiz_id);
        }
        if ($request->candidate_id) {
            $query->where('candidate_id', $request->candidate_id);
        }
        if ($request->interview_id) {
            $query->where('interview_id', $request->interview_id);
        }
        if ($request->status) {
            $query->whereIn('status', explode(',', $request->status));
        }

        $attempts = $query->orderByDesc('id')->paginate($request->per_page ?? 25);

        return response()->json(['status' => true, 'data' => $attempts]);
    }

    /**
     * Full detail for one attempt, including the answer-by-answer breakdown
     * and the proctoring event log. Only reachable by an authenticated HR
     * user, so the correct answers are safe to include here.
     */
    public function show(Request $request, $id)
    {
        $query = QuizAttempt::with(['quiz', 'candidate', 'interview']);
        $this->applyCompanyScope($query, $request);
        $attempt = $query->find($id);
        if (!$attempt) {
            return response()->json(['status' => false, 'message' => 'Attempt not found'], 404);
        }

        $questions = $attempt->quiz?->questions ?? [];
        $answers = $attempt->answers ?? [];

        $breakdown = [];
        foreach ($questions as $i => $q) {
            $given = $answers[$i] ?? null;
            $correct = $q['correct_index'] ?? null;
            $breakdown[] = [
                'index' => $i,
                'text' => $q['text'] ?? '',
                'options' => array_values($q['options'] ?? []),
                'given_index' => $given,
                'correct_index' => $correct,
                'is_correct' => $given !== null && (int) $given === (int) $correct,
                'answered' => $given !== null,
            ];
        }

        return response()->json(['status' => true, 'data' => [
            'attempt' => $attempt,
            'breakdown' => $breakdown,
            'proctor_events' => $attempt->proctor_events ?? [],
        ]]);
    }

    /**
     * Assign a quiz to a candidate. Returns the tokenised link HR sends to
     * the candidate — the token is generated here and never reused, so a
     * second assignment of the same quiz produces a genuinely new attempt.
     */
    public function store(Request $request)
    {
        $data = $request->validate([
            'quiz_id' => 'required|exists:training_quizzes,id',
            'candidate_id' => 'required|exists:candidates,id',
            'interview_id' => 'nullable|exists:interviews,id',
            // The candidate can't start before this — leave it blank for the
            // existing "startable the moment the link is opened" behavior.
            'scheduled_start_at' => 'nullable|date|after_or_equal:now',
            'link_expires_at' => 'nullable|date|after:now',
            // Callers that want to preview the email before it goes out (the
            // Assign Assessment wizard) create the attempt first with this set
            // to false, then hit sendInvitation() once the recruiter confirms.
            'send_immediately' => 'nullable|boolean',
            'subject_override' => 'nullable|string|max:255',
            'personal_message' => 'nullable|string|max:2000',
        ]);

        // Validated separately from the rules above rather than via
        // `after:scheduled_start_at`, since that comparison rule chokes when
        // the referenced field is absent — both fields are optional here.
        if (!empty($data['scheduled_start_at']) && !empty($data['link_expires_at'])
            && $data['link_expires_at'] <= $data['scheduled_start_at']) {
            return response()->json(['status' => false, 'message' => 'The link expiry must be after the scheduled start time'], 422);
        }

        $quiz = TrainingQuiz::find($data['quiz_id']);
        if (!$quiz || empty($quiz->questions) || !$quiz->is_active) {
            return response()->json(['status' => false, 'message' => 'This assessment is no longer available.'], 422);
        }

        $sendImmediately = $data['send_immediately'] ?? true;
        if ($sendImmediately) {
            $candidateEmail = Candidate::whereKey($data['candidate_id'])->value('email');
            if (!$candidateEmail || !filter_var($candidateEmail, FILTER_VALIDATE_EMAIL)) {
                return response()->json(['status' => false, 'message' => 'Candidate email address is missing.'], 422);
            }
        }

        // Closes the race between "check for an open attempt" and "create
        // one" — two near-simultaneous clicks/retries for the same
        // candidate+quiz must not both pass the check and both create a row.
        // Laravel's atomic lock works with the file cache driver too, so this
        // needs no new infrastructure.
        $lock = Cache::lock("quiz-assign:{$data['candidate_id']}:{$data['quiz_id']}", 10);
        if (!$lock->get()) {
            return response()->json(['status' => false, 'message' => 'This candidate is already being assigned this assessment. Please try again in a moment.'], 409);
        }

        try {
            // One live attempt per candidate+quiz: re-assigning while an earlier
            // attempt is still open would hand out two valid tokens for the same
            // assessment.
            $open = QuizAttempt::where('quiz_id', $data['quiz_id'])
                ->where('candidate_id', $data['candidate_id'])
                ->whereIn('status', ['pending', 'in_progress'])
                ->first();
            if ($open) {
                return response()->json([
                    'status' => false,
                    'message' => 'This candidate already has an open attempt for this quiz',
                    'data' => $open,
                ], 422);
            }

            // Default expiry is relative to the scheduled start (not "now") —
            // otherwise a start time set more than 7 days out would make the
            // link expire before its own gate ever opens.
            $startBasis = !empty($data['scheduled_start_at']) ? \Illuminate\Support\Carbon::parse($data['scheduled_start_at']) : now();
            $context = $this->defaultCompanyContext($request);

            $attempt = DB::transaction(function () use ($data, $quiz, $startBasis, $context) {
                $attempt = QuizAttempt::create([
                    'quiz_id' => $data['quiz_id'],
                    'candidate_id' => $data['candidate_id'],
                    'interview_id' => $data['interview_id'] ?? $quiz->interview_id,
                    'access_token' => \Illuminate\Support\Str::random(64),
                    'status' => 'pending',
                    'duration_minutes' => $quiz->duration_minutes ?: 30,
                    'total_questions' => count($quiz->questions),
                    'scheduled_start_at' => $data['scheduled_start_at'] ?? null,
                    'link_expires_at' => $data['link_expires_at'] ?? $startBasis->copy()->addDays(7),
                    'company_code' => $context['company_code'],
                    'unit' => $context['unit'],
                    'created_by' => auth('api')->id(),
                ]);

                AssessmentAudit::record(AssessmentAudit::ASSIGNED, $attempt, [
                    'quiz_title' => $quiz->title,
                    'scheduled_start_at' => $attempt->scheduled_start_at?->toIso8601String(),
                    'link_expires_at' => $attempt->link_expires_at?->toIso8601String(),
                    'send_immediately' => $data['send_immediately'] ?? true,
                ]);

                return $attempt;
            });
        } finally {
            $lock->release();
        }

        $attempt->load(self::EAGER_LOAD);

        $emailStatus = 'not_requested';
        if ($sendImmediately) {
            $emailStatus = $this->queueInvitation($attempt, $data['subject_override'] ?? null, $data['personal_message'] ?? null);
        }

        return response()->json([
            'status' => true,
            'message' => $sendImmediately ? 'Assessment assigned' : 'Assessment prepared',
            'data' => $attempt->fresh(self::EAGER_LOAD),
            'email_status' => $emailStatus,
        ], 201);
    }

    /**
     * Renders the exact invitation email for an already-created attempt,
     * without sending it — used by the Assign Assessment wizard's preview
     * step, so what the recruiter approves is what actually goes out (same
     * real token/link, same real candidate/job data).
     */
    public function previewEmail(Request $request, $id)
    {
        $query = QuizAttempt::with(self::EAGER_LOAD);
        $this->applyCompanyScope($query, $request);
        $attempt = $query->find($id);

        if (!$attempt) {
            return response()->json(['status' => false, 'message' => 'Attempt not found'], 404);
        }
        if (!$attempt->candidate || !$attempt->candidate->email) {
            return response()->json(['status' => false, 'message' => 'Candidate email address is missing.'], 422);
        }

        $mailable = AssessmentInviteMailFactory::build(
            $attempt,
            $attempt->quiz,
            $this->sanitizeSubject($request->string('subject_override')->toString() ?: null),
            $request->string('personal_message')->toString() ?: null,
        );

        AssessmentAudit::recordSafely(AssessmentAudit::EMAIL_PREVIEWED, $attempt);

        return response()->json(['status' => true, 'data' => [
            'to' => $attempt->candidate->email,
            'subject' => $mailable->envelope()->subject,
            'html' => $mailable->render(),
        ]]);
    }

    /** Sends the invitation for an already-created attempt (the wizard's final "Assign & Send" step). */
    public function sendInvitation(Request $request, $id)
    {
        $query = QuizAttempt::with(self::EAGER_LOAD);
        $this->applyCompanyScope($query, $request);
        $attempt = $query->find($id);

        if (!$attempt) {
            return response()->json(['status' => false, 'message' => 'Attempt not found'], 404);
        }
        if ($attempt->status === 'revoked') {
            return response()->json(['status' => false, 'message' => 'This assignment has been revoked and can no longer be sent.'], 422);
        }
        if (!$attempt->candidate || !$attempt->candidate->email) {
            return response()->json(['status' => false, 'message' => 'Candidate email address is missing.'], 422);
        }
        if ($attempt->email_status === 'sent') {
            // A double-click / retried request must not fire a second email —
            // the first send already succeeded, so this is a no-op success.
            return response()->json(['status' => true, 'message' => 'Invitation already sent', 'data' => $attempt]);
        }

        $data = $request->validate([
            'subject_override' => 'nullable|string|max:255',
            'personal_message' => 'nullable|string|max:2000',
        ]);

        $emailStatus = $this->queueInvitation($attempt, $data['subject_override'] ?? null, $data['personal_message'] ?? null);

        if ($emailStatus === 'failed') {
            return response()->json([
                'status' => false,
                'message' => 'The assessment was assigned, but the invitation email could not be sent.',
                'data' => $attempt->fresh(),
            ], 502);
        }

        return response()->json(['status' => true, 'message' => 'Invitation sent', 'data' => $attempt->fresh(), 'email_status' => $emailStatus]);
    }

    /**
     * Resends the existing invitation — reuses the same access_token/link
     * rather than rotating it, so any copy the candidate already has (or a
     * previously delivered email) keeps working rather than silently dying.
     */
    public function resendInvitation(Request $request, $id)
    {
        $query = QuizAttempt::with(self::EAGER_LOAD);
        $this->applyCompanyScope($query, $request);
        $attempt = $query->find($id);

        if (!$attempt) {
            return response()->json(['status' => false, 'message' => 'Attempt not found'], 404);
        }
        if ($attempt->status === 'revoked') {
            return response()->json(['status' => false, 'message' => 'This assignment has been revoked and can no longer be sent.'], 422);
        }
        if ($attempt->isFinished()) {
            return response()->json(['status' => false, 'message' => 'This assessment has already been completed.'], 422);
        }
        if (!$attempt->candidate || !$attempt->candidate->email) {
            return response()->json(['status' => false, 'message' => 'Candidate email address is missing.'], 422);
        }

        // A resend is a deliberate re-request even if the first send already
        // succeeded — unlike sendInvitation()'s first-send guard, this route
        // exists specifically to trigger another delivery attempt. Rapid
        // accidental duplicate clicks are still guarded by the lock below.
        $lock = Cache::lock("quiz-resend:{$attempt->id}", 15);
        if (!$lock->get()) {
            return response()->json(['status' => false, 'message' => 'A resend for this candidate is already in progress.'], 409);
        }

        try {
            $data = $request->validate([
                'subject_override' => 'nullable|string|max:255',
                'personal_message' => 'nullable|string|max:2000',
            ]);

            $emailStatus = $this->queueInvitation($attempt, $data['subject_override'] ?? null, $data['personal_message'] ?? null);
            AssessmentAudit::recordSafely(AssessmentAudit::INVITATION_RESENT, $attempt, ['recipient' => $attempt->candidate->email]);
        } finally {
            $lock->release();
        }

        if ($emailStatus === 'failed') {
            return response()->json(['status' => false, 'message' => 'The invitation could not be resent.', 'data' => $attempt->fresh()], 502);
        }

        return response()->json(['status' => true, 'message' => 'Invitation resent', 'data' => $attempt->fresh(), 'email_status' => $emailStatus]);
    }

    /**
     * Revoke — replaces the previous hard delete. The row, its email
     * history and its candidate/application linkage all survive; only
     * candidate access is cut off (PublicQuizController checks this status
     * on every request) and no further attempts are possible.
     */
    public function revoke(Request $request, $id)
    {
        $query = QuizAttempt::query();
        $this->applyCompanyScope($query, $request);
        $attempt = $query->find($id);

        if (!$attempt) {
            return response()->json(['status' => false, 'message' => 'Attempt not found'], 404);
        }
        if ($attempt->status === 'submitted') {
            return response()->json(['status' => false, 'message' => 'A submitted attempt cannot be revoked'], 422);
        }
        if ($attempt->status === 'revoked') {
            return response()->json(['status' => true, 'message' => 'Attempt already revoked', 'data' => $attempt]);
        }

        $data = $request->validate(['reason' => 'nullable|string|max:500']);
        $previousStatus = $attempt->status;

        $attempt->update([
            'status' => 'revoked',
            'revoked_at' => now(),
            'revoked_by' => auth('api')->id(),
            'revoke_reason' => $data['reason'] ?? null,
        ]);

        AssessmentAudit::record(AssessmentAudit::REVOKED, $attempt, [
            'previous_status' => $previousStatus,
            'new_status' => 'revoked',
            'reason' => $data['reason'] ?? null,
        ]);

        return response()->json(['status' => true, 'message' => 'Attempt revoked', 'data' => $attempt]);
    }

    /** Preserved route/behavior alias — the DELETE route now revokes instead of hard-deleting. */
    public function destroy(Request $request, $id)
    {
        return $this->revoke($request, $id);
    }

    /** Candidates eligible to be assigned an interview quiz. */
    public function assignableCandidates(Request $request)
    {
        $query = Candidate::query()
            ->whereNotIn('stage', ['rejected', 'offer_accepted'])
            ->select('id', 'name', 'email', 'stage', 'requisition_id');
        $this->applyCompanyScope($query, $request);

        if ($request->search) {
            $query->where('name', 'like', '%' . $request->search . '%');
        }

        return response()->json(['status' => true, 'data' => $query->orderBy('name')->limit(200)->get()]);
    }

    /**
     * Marks the attempt's email en route and dispatches the send. Runs
     * inline today (QUEUE_CONNECTION=sync in production — see
     * SendAssessmentInvitationJob's docblock) so the caller's response
     * already reflects the real outcome; under a real queue driver this
     * would return 'queued' immediately instead and the status would
     * transition asynchronously.
     */
    private function queueInvitation(QuizAttempt $attempt, ?string $subjectOverride, ?string $personalMessage): string
    {
        $subjectOverride = $this->sanitizeSubject($subjectOverride);

        $attempt->update(['email_status' => 'queued', 'email_queued_at' => now()]);
        AssessmentAudit::recordSafely(AssessmentAudit::INVITATION_QUEUED, $attempt);

        SendAssessmentInvitationJob::dispatch($attempt->id, $subjectOverride, $personalMessage);

        return $attempt->fresh()->email_status;
    }

    /** Strips line breaks (header-injection guard) and falls back to null so the Mailable's own default subject applies. */
    private function sanitizeSubject(?string $subject): ?string
    {
        if (!$subject) {
            return null;
        }
        $clean = trim(preg_replace('/[\r\n]+/', ' ', $subject));

        return $clean !== '' ? substr($clean, 0, 255) : null;
    }
}
