<?php

namespace Tests\Feature;

use App\Jobs\SendAssessmentInvitationJob;
use App\Mail\AssessmentInviteMail;
use App\Models\Candidate;
use App\Models\Department;
use App\Models\JobRequisition;
use App\Models\QuizAttempt;
use App\Models\TrainingQuiz;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class QuizAttemptEmailTest extends TestCase
{
    use RefreshDatabase;

    private function superAdmin(string $email = 'root@email.test'): User
    {
        return User::create([
            'name' => 'Root', 'email' => $email, 'password' => 'secret1234',
            'emp_code' => 'EMAIL-ROOT-' . uniqid(), 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    /** See QuizAttemptAssignmentTest::ungrantedStaff() for why role 3, not 2. */
    private function ungrantedStaff(string $email = 'nobody@email.test'): User
    {
        return User::create([
            'name' => 'No Grants', 'email' => $email, 'password' => 'secret1234',
            'emp_code' => 'EMAIL-NONE-' . uniqid(), 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    private function department(): Department
    {
        return Department::create(['name' => 'Engineering', 'company_code' => 'nidhi-impex']);
    }

    private function requisition(?int $departmentId = null): JobRequisition
    {
        return JobRequisition::create([
            'title' => 'Senior Software Engineer', 'employment_type' => 'full_time',
            'status' => 'published', 'company_code' => 'nidhi-impex', 'department_id' => $departmentId,
        ]);
    }

    private function candidate(array $overrides = []): Candidate
    {
        return Candidate::create(array_merge([
            'name' => 'Jane Candidate', 'email' => 'jane@example.com', 'source' => 'job_portal',
            'stage' => 'shortlisted', 'company_code' => 'nidhi-impex', 'unit' => 'Shreeji',
        ], $overrides));
    }

    private function quiz(): TrainingQuiz
    {
        return TrainingQuiz::create([
            'title' => 'Technical Assessment',
            'questions' => [['text' => 'Q1?', 'options' => ['A', 'B'], 'correct_index' => 0]],
            'passing_score' => 70, 'duration_minutes' => 45, 'is_active' => true,
            'company_code' => 'nidhi-impex',
        ]);
    }

    private function attempt(User $actor, Candidate $candidate, TrainingQuiz $quiz, array $overrides = []): QuizAttempt
    {
        return QuizAttempt::create(array_merge([
            'quiz_id' => $quiz->id, 'candidate_id' => $candidate->id,
            'access_token' => \Illuminate\Support\Str::random(64), 'status' => 'pending',
            'duration_minutes' => $quiz->duration_minutes, 'total_questions' => count($quiz->questions),
            'link_expires_at' => now()->addDays(7),
            'company_code' => 'nidhi-impex', 'created_by' => $actor->id,
        ], $overrides));
    }

    #[Test]
    public function preview_requires_authentication(): void
    {
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $attempt = $this->attempt($this->superAdmin(), $candidate, $quiz);

        $this->getJson("/api/hr/quiz-attempts/{$attempt->id}/email-preview")->assertStatus(401);
    }

    #[Test]
    public function preview_requires_permission(): void
    {
        $owner = $this->superAdmin();
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $attempt = $this->attempt($owner, $candidate, $quiz);

        $token = $this->withToken(auth('api')->login($this->ungrantedStaff()));
        $token->getJson("/api/hr/quiz-attempts/{$attempt->id}/email-preview")->assertStatus(403);
    }

    #[Test]
    public function preview_renders_real_candidate_position_company_location_department_and_the_real_secure_url(): void
    {
        config(['services.frontend_url' => 'https://niss.pro']);
        $dept = $this->department();
        $req = $this->requisition($dept->id);
        $candidate = $this->candidate(['requisition_id' => $req->id]);
        $quiz = $this->quiz();
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $candidate, $quiz);

        $token = $this->withToken(auth('api')->login($owner));
        $response = $token->getJson("/api/hr/quiz-attempts/{$attempt->id}/email-preview?" . http_build_query([
            'subject_override' => 'Custom Subject Line',
            'personal_message' => 'Good luck!',
        ]));

        $response->assertOk();
        $response->assertJsonPath('data.to', 'jane@example.com');
        $response->assertJsonPath('data.subject', 'Custom Subject Line');

        $html = $response->json('data.html');
        $this->assertStringContainsString('Jane Candidate', $html);
        $this->assertStringContainsString('Senior Software Engineer', $html);
        $this->assertStringContainsString('Nidhi Impex', $html);
        $this->assertStringContainsString('Shreeji', $html);
        $this->assertStringContainsString('Engineering', $html);
        $this->assertStringContainsString("https://niss.pro/quiz/{$attempt->access_token}", $html);
        $this->assertStringContainsString('Good luck!', $html);
    }

    /**
     * Regression test for the Blade compiler bug found while building this:
     * `word@if(...)` isn't recognized as a directive without a preceding word
     * boundary, so the literal `@if(...)` text stayed in the compiled output
     * while its `@endif` compiled fine — producing a mismatched endif that
     * only broke at render time, never at `php -l`.
     */
    #[Test]
    public function the_rendered_email_never_contains_literal_blade_directives(): void
    {
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $candidate, $quiz);

        $token = $this->withToken(auth('api')->login($owner));
        $html = $token->getJson("/api/hr/quiz-attempts/{$attempt->id}/email-preview")->json('data.html');

        foreach (['@if', '@endif', '@foreach', '@endforeach', '@else'] as $directive) {
            $this->assertStringNotContainsString($directive, $html, "Literal Blade directive '{$directive}' leaked into rendered output");
        }
    }

    #[Test]
    public function subject_override_falls_back_to_the_default_when_empty(): void
    {
        $req = $this->requisition();
        $candidate = $this->candidate(['requisition_id' => $req->id]);
        $quiz = $this->quiz();
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $candidate, $quiz);

        $token = $this->withToken(auth('api')->login($owner));
        $response = $token->getJson("/api/hr/quiz-attempts/{$attempt->id}/email-preview");

        $response->assertJsonPath('data.subject', 'Your NISS Assessment Is Ready – Senior Software Engineer');
    }

    #[Test]
    public function a_personal_message_with_html_is_escaped_not_executed(): void
    {
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $candidate, $quiz);

        $token = $this->withToken(auth('api')->login($owner));
        $html = $token->getJson("/api/hr/quiz-attempts/{$attempt->id}/email-preview?" . http_build_query([
            'personal_message' => '<script>alert(1)</script>',
        ]))->json('data.html');

        $this->assertStringNotContainsString('<script>alert(1)</script>', $html);
    }

    #[Test]
    public function sending_dispatches_the_invitation_job_and_updates_email_status(): void
    {
        Bus::fake();
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $candidate, $quiz);

        $token = $this->withToken(auth('api')->login($owner));
        $token->postJson("/api/hr/quiz-attempts/{$attempt->id}/send-invitation")->assertOk();

        Bus::assertDispatched(SendAssessmentInvitationJob::class, fn ($job) => $job->attemptId === $attempt->id);
        $this->assertSame('queued', $attempt->fresh()->email_status);
    }

    #[Test]
    public function an_unauthorized_user_cannot_send_an_invitation(): void
    {
        $owner = $this->superAdmin();
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $attempt = $this->attempt($owner, $candidate, $quiz);

        $token = $this->withToken(auth('api')->login($this->ungrantedStaff()));
        $token->postJson("/api/hr/quiz-attempts/{$attempt->id}/send-invitation")->assertStatus(403);
        $this->assertSame('not_requested', $attempt->fresh()->email_status);
    }

    #[Test]
    public function a_processed_job_updates_email_status_to_sent_and_records_an_audit_event(): void
    {
        Mail::fake();
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $candidate, $quiz, ['email_status' => 'queued']);

        (new SendAssessmentInvitationJob($attempt->id))->handle();

        $fresh = $attempt->fresh();
        $this->assertSame('sent', $fresh->email_status);
        $this->assertNotNull($fresh->email_sent_at);
        Mail::assertSent(AssessmentInviteMail::class);
        $this->assertDatabaseHas('assessment_audit_logs', [
            'quiz_attempt_id' => $attempt->id,
            'action' => 'ASSESSMENT_INVITATION_SENT',
        ]);
    }

    #[Test]
    public function a_job_failure_preserves_the_assignment_and_marks_email_failed(): void
    {
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('smtp unreachable'));
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $candidate, $quiz, ['email_status' => 'queued']);

        try {
            (new SendAssessmentInvitationJob($attempt->id))->handle();
        } catch (\Throwable $e) {
            // The job intentionally rethrows so the queue's own retry policy
            // decides whether to try again — the assignment must still exist.
        }

        $this->assertNotNull(QuizAttempt::find($attempt->id));
        $this->assertSame('failed', $attempt->fresh()->email_status);
        $this->assertNotNull($attempt->fresh()->email_failure_reason);
    }

    #[Test]
    public function a_queued_job_skips_sending_if_the_assignment_was_revoked_before_it_ran(): void
    {
        Mail::fake();
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $owner = $this->superAdmin();
        // Simulates: assign -> queue email -> revoke -> worker finally picks up the job.
        $attempt = $this->attempt($owner, $candidate, $quiz, ['email_status' => 'queued', 'status' => 'revoked']);

        (new SendAssessmentInvitationJob($attempt->id))->handle();

        Mail::assertNothingSent();
        $this->assertSame('queued', $attempt->fresh()->email_status); // untouched, not silently marked sent/failed
    }

    #[Test]
    public function resending_reuses_the_same_access_token(): void
    {
        Bus::fake();
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $candidate, $quiz, ['email_status' => 'sent']);
        $originalToken = $attempt->access_token;

        $token = $this->withToken(auth('api')->login($owner));
        $token->postJson("/api/hr/quiz-attempts/{$attempt->id}/resend-invitation")->assertOk();

        $this->assertSame($originalToken, $attempt->fresh()->access_token);
        Bus::assertDispatched(SendAssessmentInvitationJob::class);
    }

    #[Test]
    public function a_revoked_assignment_cannot_send_or_resend(): void
    {
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $candidate, $quiz, ['status' => 'revoked']);

        $token = $this->withToken(auth('api')->login($owner));
        $token->postJson("/api/hr/quiz-attempts/{$attempt->id}/send-invitation")->assertStatus(422);
        $token->postJson("/api/hr/quiz-attempts/{$attempt->id}/resend-invitation")->assertStatus(422);
    }
}
