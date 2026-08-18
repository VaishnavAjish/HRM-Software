<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\JobRequisition;
use App\Models\QuizAttempt;
use App\Models\TrainingQuiz;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Phase B: assignment authorization, validation, and idempotency. Assign
 * previously ran unauthenticated-by-permission-registry (hr.training.create,
 * seeded ad hoc, bypassing PermissionRegistry) — these pin the new
 * assessment.assign-gated route plus the create-time guards that always
 * existed (open-attempt dedupe, inactive-assessment rejection).
 */
class QuizAttemptAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private function superAdmin(string $email = 'root@assign.test'): User
    {
        return User::create([
            'name' => 'Root', 'email' => $email, 'password' => 'secret1234',
            'emp_code' => 'ASSIGN-ROOT-' . uniqid(), 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    /**
     * No assessment.* grant, and a role (3 = plain employee) that does not
     * map into the authorization engine's legacy "admin" bucket (0/1/2) or
     * "agent" bucket (4/type=agent) — those two legacy buckets bypass the
     * fine-grained permission check entirely while enforcement is in shadow
     * mode (AUTHZ_MODE=shadow, the current default everywhere in this app —
     * see PermissionEnforcementPolicy/config/authorization.php). Only the
     * "employee" bucket is actually denied for a non-self permission like
     * assessment.assign, so it's the only role that exercises a real 403
     * under today's real, currently-deployed enforcement posture.
     */
    private function ungrantedStaff(string $email = 'nobody@assign.test'): User
    {
        return User::create([
            'name' => 'No Grants', 'email' => $email, 'password' => 'secret1234',
            'emp_code' => 'ASSIGN-NONE-' . uniqid(), 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    private function requisition(array $overrides = []): JobRequisition
    {
        return JobRequisition::create(array_merge([
            'title' => 'Senior Software Engineer', 'employment_type' => 'full_time',
            'status' => 'published', 'company_code' => 'nidhi-impex',
        ], $overrides));
    }

    private function candidate(array $overrides = []): Candidate
    {
        return Candidate::create(array_merge([
            'name' => 'Jane Candidate', 'email' => 'jane@example.com', 'source' => 'job_portal',
            'stage' => 'shortlisted', 'company_code' => 'nidhi-impex',
        ], $overrides));
    }

    private function quiz(array $overrides = []): TrainingQuiz
    {
        return TrainingQuiz::create(array_merge([
            'title' => 'Technical Assessment',
            'questions' => [['text' => 'Q1?', 'options' => ['A', 'B'], 'correct_index' => 0]],
            'passing_score' => 70, 'duration_minutes' => 45, 'is_active' => true,
            'company_code' => 'nidhi-impex',
        ], $overrides));
    }

    #[Test]
    public function an_authorized_recruiter_can_assign_an_assessment(): void
    {
        Mail::fake();
        $token = $this->withToken(auth('api')->login($this->superAdmin()));
        $candidate = $this->candidate();
        $quiz = $this->quiz();

        $response = $token->postJson('/api/hr/quiz-attempts/store', [
            'quiz_id' => $quiz->id,
            'candidate_id' => $candidate->id,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('status', true);
        $this->assertSame(1, QuizAttempt::where('candidate_id', $candidate->id)->count());
    }

    #[Test]
    public function an_unauthorized_user_cannot_assign_an_assessment(): void
    {
        $token = $this->withToken(auth('api')->login($this->ungrantedStaff()));
        $candidate = $this->candidate();
        $quiz = $this->quiz();

        $response = $token->postJson('/api/hr/quiz-attempts/store', [
            'quiz_id' => $quiz->id,
            'candidate_id' => $candidate->id,
        ]);

        $response->assertStatus(403);
        $this->assertSame(0, QuizAttempt::count());
    }

    #[Test]
    public function an_unauthenticated_request_is_rejected(): void
    {
        $candidate = $this->candidate();
        $quiz = $this->quiz();

        $this->postJson('/api/hr/quiz-attempts/store', [
            'quiz_id' => $quiz->id,
            'candidate_id' => $candidate->id,
        ])->assertStatus(401);
    }

    #[Test]
    public function an_inactive_assessment_is_rejected(): void
    {
        $token = $this->withToken(auth('api')->login($this->superAdmin()));
        $candidate = $this->candidate();
        $quiz = $this->quiz(['is_active' => false]);

        $token->postJson('/api/hr/quiz-attempts/store', [
            'quiz_id' => $quiz->id,
            'candidate_id' => $candidate->id,
        ])->assertStatus(422)->assertJsonPath('message', 'This assessment is no longer available.');
    }

    #[Test]
    public function a_candidate_with_no_email_is_rejected_when_sending_immediately(): void
    {
        $token = $this->withToken(auth('api')->login($this->superAdmin()));
        $candidate = $this->candidate(['email' => null]);
        $quiz = $this->quiz();

        $token->postJson('/api/hr/quiz-attempts/store', [
            'quiz_id' => $quiz->id,
            'candidate_id' => $candidate->id,
        ])->assertStatus(422)->assertJsonPath('message', 'Candidate email address is missing.');
    }

    #[Test]
    public function send_immediately_false_creates_the_assignment_without_sending(): void
    {
        Mail::fake();
        $token = $this->withToken(auth('api')->login($this->superAdmin()));
        $candidate = $this->candidate(['email' => null]); // would fail the email check if send_immediately were true
        $quiz = $this->quiz();

        $response = $token->postJson('/api/hr/quiz-attempts/store', [
            'quiz_id' => $quiz->id,
            'candidate_id' => $candidate->id,
            'send_immediately' => false,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('email_status', 'not_requested');
        Mail::assertNothingSent();
    }

    #[Test]
    public function an_invalid_candidate_is_rejected(): void
    {
        $token = $this->withToken(auth('api')->login($this->superAdmin()));
        $quiz = $this->quiz();

        $token->postJson('/api/hr/quiz-attempts/store', [
            'quiz_id' => $quiz->id,
            'candidate_id' => 999999,
        ])->assertStatus(422);
    }

    #[Test]
    public function an_invalid_assessment_is_rejected(): void
    {
        $token = $this->withToken(auth('api')->login($this->superAdmin()));
        $candidate = $this->candidate();

        $token->postJson('/api/hr/quiz-attempts/store', [
            'quiz_id' => 999999,
            'candidate_id' => $candidate->id,
        ])->assertStatus(422);
    }

    #[Test]
    public function an_invalid_date_range_is_rejected(): void
    {
        $token = $this->withToken(auth('api')->login($this->superAdmin()));
        $candidate = $this->candidate();
        $quiz = $this->quiz();

        $token->postJson('/api/hr/quiz-attempts/store', [
            'quiz_id' => $quiz->id,
            'candidate_id' => $candidate->id,
            'scheduled_start_at' => now()->addDays(2)->toIso8601String(),
            'link_expires_at' => now()->addDay()->toIso8601String(), // before the start
        ])->assertStatus(422)->assertJsonPath('message', 'The link expiry must be after the scheduled start time');
    }

    #[Test]
    public function a_second_open_attempt_for_the_same_candidate_and_quiz_is_rejected(): void
    {
        Mail::fake();
        $token = $this->withToken(auth('api')->login($this->superAdmin()));
        $candidate = $this->candidate();
        $quiz = $this->quiz();

        $token->postJson('/api/hr/quiz-attempts/store', ['quiz_id' => $quiz->id, 'candidate_id' => $candidate->id])->assertCreated();
        $token->postJson('/api/hr/quiz-attempts/store', ['quiz_id' => $quiz->id, 'candidate_id' => $candidate->id])
            ->assertStatus(422)
            ->assertJsonPath('message', 'This candidate already has an open attempt for this quiz');

        $this->assertSame(1, QuizAttempt::where('candidate_id', $candidate->id)->where('quiz_id', $quiz->id)->count());
    }

    #[Test]
    public function a_duplicate_http_submission_does_not_create_a_duplicate_assignment(): void
    {
        Mail::fake();
        $token = $this->withToken(auth('api')->login($this->superAdmin()));
        $candidate = $this->candidate();
        $quiz = $this->quiz();
        $payload = ['quiz_id' => $quiz->id, 'candidate_id' => $candidate->id];

        // Simulates a browser/network retry firing the identical request twice
        // in quick succession — the atomic lock in store() must let exactly
        // one through and reject the other, not race two creates.
        $first = $token->postJson('/api/hr/quiz-attempts/store', $payload);
        $second = $token->postJson('/api/hr/quiz-attempts/store', $payload);

        $statuses = collect([$first->status(), $second->status()])->sort()->values();
        $this->assertSame([201, 422], $statuses->all());
        $this->assertSame(1, QuizAttempt::where('candidate_id', $candidate->id)->count());
    }
}
