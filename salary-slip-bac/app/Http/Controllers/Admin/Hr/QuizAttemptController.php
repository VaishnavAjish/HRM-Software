<?php

namespace App\Http\Controllers\Admin\Hr;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Controller;
use App\Models\Candidate;
use App\Models\QuizAttempt;
use App\Models\TrainingQuiz;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * HR-facing side of the interview quiz: assigning a quiz to a candidate,
 * watching results come in, and reading the proctoring trail afterwards.
 * The candidate's own side lives in PublicQuizController — this controller
 * never serves quiz content to a candidate.
 */
class QuizAttemptController extends Controller
{
    use ScopesCompany;

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
    public function show($id)
    {
        $attempt = QuizAttempt::with(['quiz', 'candidate', 'interview'])->find($id);
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
            'link_expires_at' => 'nullable|date|after:now',
        ]);

        $quiz = TrainingQuiz::find($data['quiz_id']);
        if (!$quiz || empty($quiz->questions)) {
            return response()->json(['status' => false, 'message' => 'This quiz has no questions yet'], 422);
        }

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

        $context = $this->defaultCompanyContext($request);
        $attempt = QuizAttempt::create([
            'quiz_id' => $data['quiz_id'],
            'candidate_id' => $data['candidate_id'],
            'interview_id' => $data['interview_id'] ?? $quiz->interview_id,
            'access_token' => Str::random(64),
            'status' => 'pending',
            'duration_minutes' => $quiz->duration_minutes ?: 30,
            'total_questions' => count($quiz->questions),
            'link_expires_at' => $data['link_expires_at'] ?? now()->addDays(7),
            'company_code' => $context['company_code'],
            'unit' => $context['unit'],
            'created_by' => auth('api')->id(),
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Quiz assigned',
            'data' => $attempt->load(['quiz:id,title', 'candidate:id,name,email']),
        ], 201);
    }

    /** Revoke an unfinished attempt so its link stops working. */
    public function destroy($id)
    {
        $attempt = QuizAttempt::find($id);
        if (!$attempt) {
            return response()->json(['status' => false, 'message' => 'Attempt not found'], 404);
        }
        if ($attempt->status === 'submitted') {
            return response()->json(['status' => false, 'message' => 'A submitted attempt cannot be revoked'], 422);
        }

        $attempt->delete();

        return response()->json(['status' => true, 'message' => 'Attempt revoked']);
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
}
