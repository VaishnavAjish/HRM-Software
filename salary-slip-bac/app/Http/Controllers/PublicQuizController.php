<?php

namespace App\Http\Controllers;

use App\Models\QuizAttempt;
use Illuminate\Http\Request;

/**
 * The candidate's side of an interview quiz. Candidates are not users and
 * have no login, so the per-attempt access token IS the credential — which
 * makes this the one place in the HR module where an unauthenticated caller
 * can read data, and every method here is written on that basis:
 *
 *  - the answer key (`correct_index`) is never serialised to this endpoint;
 *  - the score is always recomputed server-side from the submitted answers,
 *    never taken from the client;
 *  - the clock is enforced against `started_at` stored server-side, so
 *    editing the countdown in the browser buys nothing;
 *  - a finished attempt can never be reopened.
 */
class PublicQuizController extends Controller
{
    private function findAttempt(string $token): ?QuizAttempt
    {
        return QuizAttempt::with(['quiz', 'candidate:id,name'])
            ->where('access_token', $token)
            ->first();
    }

    /**
     * Attempt metadata + questions. Returns the questions only once the
     * attempt is actually in progress, so the paper can't be lifted from the
     * link before starting the timer.
     */
    public function show($token)
    {
        $attempt = $this->findAttempt($token);
        if (!$attempt) {
            return response()->json(['status' => false, 'message' => 'This quiz link is not valid'], 404);
        }
        // Revoked is checked before anything else and returns nothing about
        // why — no revoke reason, no recruiter name, no internal status.
        if ($attempt->status === 'revoked') {
            return response()->json(['status' => false, 'message' => 'This assessment is no longer available. Please contact the recruitment team if you believe this is an error.'], 410);
        }

        // A link that was never started can expire; one already in progress
        // is governed by its own countdown instead.
        if ($attempt->status === 'pending' && $attempt->link_expires_at && now()->greaterThan($attempt->link_expires_at)) {
            $attempt->update(['status' => 'expired']);
        }

        // Running out of time while the tab was closed still ends the attempt.
        if ($attempt->status === 'in_progress' && $attempt->isTimedOut()) {
            $this->finalise($attempt, 'submitted', 'Time limit reached');
        }

        $quiz = $attempt->quiz;

        return response()->json(['status' => true, 'data' => [
            'candidate_name' => $attempt->candidate?->name,
            'quiz' => [
                'title' => $quiz?->title,
                'description' => $quiz?->description,
                'passing_score' => $quiz?->passing_score,
                'max_violations' => $quiz?->max_violations ?? 3,
                'total_questions' => count($quiz?->questions ?? []),
            ],
            'status' => $attempt->status,
            'duration_minutes' => $attempt->duration_minutes,
            'scheduled_start_at' => $attempt->scheduled_start_at,
            'not_yet_open' => $attempt->status === 'pending' && $attempt->notYetOpen(),
            'started_at' => $attempt->started_at,
            'deadline' => $attempt->deadline(),
            'seconds_remaining' => $attempt->deadline() ? max(0, now()->diffInSeconds($attempt->deadline(), false)) : null,
            'violation_count' => $attempt->violation_count,
            'answers' => $attempt->status === 'in_progress' ? ($attempt->answers ?? []) : [],
            // Answer key stripped — see questionsForCandidate().
            'questions' => $attempt->status === 'in_progress' ? ($quiz?->questionsForCandidate() ?? []) : [],
            // Only ever shown after the fact, and only the headline numbers.
            'result' => $attempt->isFinished() ? [
                'score' => $attempt->score,
                'passed' => $attempt->passed,
                'correct_count' => $attempt->correct_count,
                'total_questions' => $attempt->total_questions,
                'submitted_at' => $attempt->submitted_at,
            ] : null,
        ]]);
    }

    /** Starts the clock. Only valid once — restarting would reset the timer. */
    public function start(Request $request, $token)
    {
        $attempt = $this->findAttempt($token);
        if (!$attempt) {
            return response()->json(['status' => false, 'message' => 'This quiz link is not valid'], 404);
        }
        if ($attempt->status === 'revoked') {
            return response()->json(['status' => false, 'message' => 'This assessment is no longer available. Please contact the recruitment team if you believe this is an error.'], 410);
        }
        if ($attempt->isFinished()) {
            return response()->json(['status' => false, 'message' => 'This assessment has already been completed.'], 422);
        }
        if ($attempt->status === 'in_progress') {
            return response()->json(['status' => true, 'message' => 'Already in progress']);
        }
        if ($attempt->notYetOpen()) {
            return response()->json([
                'status' => false,
                'message' => 'This assessment is not available yet. Available from ' . $attempt->scheduled_start_at->format('d M Y, h:i A') . '.',
            ], 422);
        }
        if ($attempt->link_expires_at && now()->greaterThan($attempt->link_expires_at)) {
            $attempt->update(['status' => 'expired']);

            return response()->json(['status' => false, 'message' => 'This quiz link has expired'], 422);
        }

        $attempt->update([
            'status' => 'in_progress',
            'started_at' => now(),
            'ip_address' => substr((string) $request->ip(), 0, 45),
            'user_agent' => substr((string) $request->userAgent(), 0, 1000),
            'proctor_events' => array_merge($attempt->proctor_events ?? [], [[
                'type' => 'started',
                'at' => now()->toIso8601String(),
                'detail' => 'Candidate started the quiz',
            ]]),
        ]);

        return response()->json(['status' => true, 'message' => 'Quiz started', 'data' => [
            'deadline' => $attempt->fresh()->deadline(),
            'questions' => $attempt->quiz?->questionsForCandidate() ?? [],
        ]]);
    }

    /** Saves progress mid-attempt so a crash or timeout keeps the answers. */
    public function saveProgress(Request $request, $token)
    {
        $attempt = $this->findAttempt($token);
        if (!$attempt || $attempt->status !== 'in_progress') {
            return response()->json(['status' => false, 'message' => 'This quiz is not in progress'], 422);
        }

        $data = $request->validate(['answers' => 'nullable|array']);
        $attempt->update(['answers' => $data['answers'] ?? []]);

        if ($attempt->isTimedOut()) {
            $this->finalise($attempt, 'submitted', 'Time limit reached');

            return response()->json(['status' => false, 'message' => 'Time is up', 'data' => ['status' => 'submitted']], 422);
        }

        return response()->json(['status' => true]);
    }

    /**
     * Records a proctoring event. Posted as each one happens rather than
     * batched at the end, so leaving the page mid-attempt still leaves a
     * trail. Crossing the quiz's violation threshold terminates the attempt.
     */
    public function logEvent(Request $request, $token)
    {
        $attempt = $this->findAttempt($token);
        if (!$attempt || $attempt->status !== 'in_progress') {
            return response()->json(['status' => false, 'message' => 'This quiz is not in progress'], 422);
        }

        $data = $request->validate([
            'type' => 'required|string|max:60',
            'detail' => 'nullable|string|max:500',
            'counts_as_violation' => 'nullable|boolean',
        ]);

        $isViolation = (bool) ($data['counts_as_violation'] ?? true);
        $events = $attempt->proctor_events ?? [];
        $events[] = [
            'type' => $data['type'],
            'at' => now()->toIso8601String(),
            'detail' => $data['detail'] ?? null,
            'violation' => $isViolation,
        ];

        $violations = $attempt->violation_count + ($isViolation ? 1 : 0);
        $attempt->update([
            'proctor_events' => $events,
            'violation_count' => $violations,
        ]);

        $max = $attempt->quiz?->max_violations ?? 3;
        if ($isViolation && $violations >= $max) {
            $this->finalise($attempt, 'terminated', "Terminated automatically after {$violations} proctoring violations");

            return response()->json([
                'status' => true,
                'data' => ['terminated' => true, 'violation_count' => $violations, 'max_violations' => $max],
                'message' => 'Attempt terminated due to repeated violations',
            ]);
        }

        return response()->json(['status' => true, 'data' => [
            'terminated' => false,
            'violation_count' => $violations,
            'max_violations' => $max,
        ]]);
    }

    public function submit(Request $request, $token)
    {
        $attempt = $this->findAttempt($token);
        if (!$attempt) {
            return response()->json(['status' => false, 'message' => 'This quiz link is not valid'], 404);
        }
        if ($attempt->status === 'revoked') {
            return response()->json(['status' => false, 'message' => 'This assessment is no longer available.'], 410);
        }
        if ($attempt->isFinished()) {
            return response()->json(['status' => false, 'message' => 'This quiz has already been submitted'], 422);
        }

        $data = $request->validate(['answers' => 'nullable|array']);
        $attempt->answers = $data['answers'] ?? $attempt->answers ?? [];

        $late = $attempt->isTimedOut();
        $this->finalise($attempt, 'submitted', $late ? 'Submitted after the time limit' : 'Submitted by candidate');

        $fresh = $attempt->fresh();

        return response()->json(['status' => true, 'message' => 'Quiz submitted', 'data' => [
            'score' => $fresh->score,
            'passed' => $fresh->passed,
            'correct_count' => $fresh->correct_count,
            'total_questions' => $fresh->total_questions,
        ]]);
    }

    /**
     * Single place where an attempt reaches a terminal state, so scoring and
     * the closing audit entry can't diverge between the submit / timeout /
     * termination paths.
     */
    private function finalise(QuizAttempt $attempt, string $status, string $reason): void
    {
        $questions = $attempt->quiz?->questions ?? [];
        $answers = $attempt->answers ?? [];

        $correct = 0;
        foreach ($questions as $i => $q) {
            $given = $answers[$i] ?? null;
            if ($given !== null && (int) $given === (int) ($q['correct_index'] ?? -1)) {
                $correct++;
            }
        }

        $total = count($questions);
        $score = $total > 0 ? (int) round(($correct / $total) * 100) : 0;
        $passing = $attempt->quiz?->passing_score ?? 60;

        $events = $attempt->proctor_events ?? [];
        $events[] = [
            'type' => $status === 'terminated' ? 'terminated' : 'submitted',
            'at' => now()->toIso8601String(),
            'detail' => $reason,
            'violation' => false,
        ];

        $attempt->update([
            'status' => $status,
            'submitted_at' => now(),
            'answers' => $answers,
            'total_questions' => $total,
            'correct_count' => $correct,
            'score' => $score,
            // A terminated attempt never counts as a pass, whatever was scored
            // before the proctoring threshold was crossed.
            'passed' => $status === 'submitted' && $score >= $passing,
            'proctor_events' => $events,
        ]);
    }
}
