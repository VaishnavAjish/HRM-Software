<?php

namespace App\Jobs;

use App\Models\QuizAttempt;
use App\Services\Assessments\AssessmentAudit;
use App\Services\Assessments\AssessmentInviteMailFactory;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * The app has no supervised queue worker in production yet (QUEUE_CONNECTION
 * is `sync`, so this still runs inline within the request today) — but the
 * dispatch/job boundary means flipping that one .env value plus running
 * `php artisan queue:work` is the entire migration to real async delivery,
 * with zero code changes here. See AWS_DEPLOYMENT_GUIDE.md for what that
 * cutover needs.
 *
 * Re-validates the assignment at execution time rather than trusting the
 * state it had when queued — a revoke that lands between "queued" and
 * "worker picks it up" must not still mail out a now-dead link.
 */
class SendAssessmentInvitationJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 3;
    public array $backoff = [10, 60, 300];

    public function __construct(
        public int $attemptId,
        public ?string $subjectOverride = null,
        public ?string $personalMessage = null,
    ) {
    }

    public function handle(): void
    {
        $attempt = QuizAttempt::with([
            'quiz:id,title,duration_minutes,passing_score',
            'candidate:id,name,email,requisition_id,company_code,unit',
            'candidate.requisition:id,title,department_id',
            'candidate.requisition.department:id,name',
        ])->find($this->attemptId);

        if (!$attempt) {
            Log::warning('assessment_invite_job_skipped', ['attempt_id' => $this->attemptId, 'reason' => 'attempt_not_found']);

            return;
        }
        if ($attempt->status === 'revoked') {
            Log::info('assessment_invite_job_skipped', ['attempt_id' => $attempt->id, 'reason' => 'attempt_revoked']);

            return;
        }
        if ($attempt->email_status === 'sent') {
            // Already succeeded for this attempt — a retried/duplicated job
            // must not send a second email.
            return;
        }
        if (!$attempt->candidate || !$attempt->candidate->email) {
            $attempt->update(['email_status' => 'failed', 'email_failed_at' => now(), 'email_failure_reason' => 'Candidate email address is missing.']);

            return;
        }

        $attempt->update(['email_status' => 'sending', 'email_attempt_count' => $attempt->email_attempt_count + 1]);

        try {
            $mailable = AssessmentInviteMailFactory::build($attempt, $attempt->quiz, $this->subjectOverride, $this->personalMessage);
            Mail::to($attempt->candidate->email)->send($mailable);

            $attempt->update(['email_status' => 'sent', 'email_sent_at' => now(), 'email_failure_reason' => null]);
            AssessmentAudit::recordSafely(AssessmentAudit::INVITATION_SENT, $attempt, [
                'recipient' => $attempt->candidate->email,
                'subject' => $mailable->envelope()->subject,
            ]);
        } catch (\Throwable $e) {
            Log::error('assessment_invite_send_failed', ['attempt_id' => $attempt->id, 'error' => $e->getMessage()]);
            // The recruiter-facing reason is deliberately generic — provider
            // stack traces stay in the application log, not this column.
            $attempt->update([
                'email_status' => 'failed',
                'email_failed_at' => now(),
                'email_failure_reason' => 'The mail provider could not be reached. Try resending, or contact support if it keeps failing.',
            ]);
            AssessmentAudit::recordSafely(AssessmentAudit::INVITATION_FAILED, $attempt, ['recipient' => $attempt->candidate->email]);

            throw $e; // let the queue's own retry/backoff decide whether to try again
        }
    }

    public function failed(\Throwable $e): void
    {
        $attempt = QuizAttempt::find($this->attemptId);
        if ($attempt && $attempt->email_status !== 'sent') {
            $attempt->update([
                'email_status' => 'failed',
                'email_failed_at' => now(),
                'email_failure_reason' => 'The invitation could not be delivered after multiple attempts.',
            ]);
        }
    }
}
