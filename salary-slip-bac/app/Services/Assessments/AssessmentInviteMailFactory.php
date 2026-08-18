<?php

namespace App\Services\Assessments;

use App\Mail\AssessmentInviteMail;
use App\Models\QuizAttempt;
use App\Models\TrainingQuiz;
use Illuminate\Support\Str;

/**
 * Single place that turns an attempt into the invite Mailable — used by both
 * the synchronous preview render (QuizAttemptController::previewEmail) and
 * the queued send (SendAssessmentInvitationJob), so what the recruiter
 * approves in preview is provably the same builder that sends.
 */
class AssessmentInviteMailFactory
{
    public static function build(QuizAttempt $attempt, TrainingQuiz $quiz, ?string $subjectOverride, ?string $personalMessage): AssessmentInviteMail
    {
        $candidate = $attempt->candidate;
        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');
        $quizUrl = $frontendUrl ? "{$frontendUrl}/quiz/{$attempt->access_token}" : null;

        return new AssessmentInviteMail(
            candidateName: $candidate->name,
            roleTitle: $candidate->requisition?->title ?? 'your application',
            quizTitle: $quiz->title,
            durationMinutes: $attempt->duration_minutes,
            passingScore: $quiz->passing_score,
            quizUrl: $quizUrl,
            startsAt: $attempt->scheduled_start_at?->format('l, d M Y \a\t h:i A'),
            expiresAt: $attempt->link_expires_at?->format('d M Y, h:i A'),
            companyName: $candidate->company_code ? Str::headline($candidate->company_code) : null,
            location: $candidate->unit,
            departmentName: $candidate->requisition?->department?->name,
            subjectOverride: $subjectOverride,
            personalMessage: $personalMessage ? strip_tags($personalMessage) : null,
        );
    }
}
