<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\QuizAttempt;
use App\Models\TrainingQuiz;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Revoke previously hard-deleted the row (see QuizAttemptController::destroy,
 * pre-Phase-B) — these pin the replacement: a soft `revoked` status that
 * preserves the row, its email history, and the candidate linkage, while
 * cutting off further candidate access.
 */
class QuizAttemptRevocationTest extends TestCase
{
    use RefreshDatabase;

    private function superAdmin(string $email = 'root@revoke.test'): User
    {
        return User::create([
            'name' => 'Root', 'email' => $email, 'password' => 'secret1234',
            'emp_code' => 'REVOKE-ROOT-' . uniqid(), 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    /** See QuizAttemptAssignmentTest::ungrantedStaff() for why role 3, not 2. */
    private function ungrantedStaff(string $email = 'nobody@revoke.test'): User
    {
        return User::create([
            'name' => 'No Grants', 'email' => $email, 'password' => 'secret1234',
            'emp_code' => 'REVOKE-NONE-' . uniqid(), 'role' => 3, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    private function candidate(): Candidate
    {
        return Candidate::create([
            'name' => 'Jane Candidate', 'email' => 'jane@example.com', 'source' => 'job_portal',
            'stage' => 'shortlisted', 'company_code' => 'nidhi-impex',
        ]);
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
    public function revoke_requires_permission(): void
    {
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $this->candidate(), $this->quiz());

        $token = $this->withToken(auth('api')->login($this->ungrantedStaff()));
        $token->deleteJson("/api/hr/quiz-attempts/delete/{$attempt->id}")->assertStatus(403);
        $this->assertSame('pending', $attempt->fresh()->status);
    }

    #[Test]
    public function revoke_preserves_the_database_row(): void
    {
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $this->candidate(), $this->quiz());

        $token = $this->withToken(auth('api')->login($owner));
        $token->deleteJson("/api/hr/quiz-attempts/delete/{$attempt->id}", ['reason' => 'assigned the wrong assessment'])->assertOk();

        $fresh = QuizAttempt::find($attempt->id);
        $this->assertNotNull($fresh, 'the row must still exist after revoke');
        $this->assertSame('revoked', $fresh->status);
        $this->assertNotNull($fresh->revoked_at);
        $this->assertSame($owner->id, $fresh->revoked_by);
        $this->assertSame('assigned the wrong assessment', $fresh->revoke_reason);
    }

    #[Test]
    public function revoke_creates_an_audit_event(): void
    {
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $this->candidate(), $this->quiz());

        $token = $this->withToken(auth('api')->login($owner));
        $token->deleteJson("/api/hr/quiz-attempts/delete/{$attempt->id}", ['reason' => 'wrong assessment'])->assertOk();

        $this->assertDatabaseHas('assessment_audit_logs', [
            'quiz_attempt_id' => $attempt->id,
            'action' => 'ASSESSMENT_REVOKED',
            'actor_user_id' => $owner->id,
        ]);
    }

    #[Test]
    public function a_submitted_attempt_cannot_be_revoked_and_its_data_is_preserved(): void
    {
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $this->candidate(), $this->quiz(), [
            'status' => 'submitted', 'score' => 90, 'passed' => true, 'submitted_at' => now(),
        ]);

        $token = $this->withToken(auth('api')->login($owner));
        $token->deleteJson("/api/hr/quiz-attempts/delete/{$attempt->id}")->assertStatus(422);

        $fresh = $attempt->fresh();
        $this->assertSame('submitted', $fresh->status);
        $this->assertSame(90, $fresh->score);
        $this->assertTrue($fresh->passed);
    }

    #[Test]
    public function revoking_twice_is_idempotent_not_an_error(): void
    {
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $this->candidate(), $this->quiz());
        $token = $this->withToken(auth('api')->login($owner));

        $token->deleteJson("/api/hr/quiz-attempts/delete/{$attempt->id}")->assertOk();
        $token->deleteJson("/api/hr/quiz-attempts/delete/{$attempt->id}")->assertOk();

        $this->assertSame('revoked', $attempt->fresh()->status);
    }

    #[Test]
    public function a_revoked_links_candidate_side_access_is_immediately_denied(): void
    {
        $owner = $this->superAdmin();
        $attempt = $this->attempt($owner, $this->candidate(), $this->quiz());
        $token = $this->withToken(auth('api')->login($owner));
        $token->deleteJson("/api/hr/quiz-attempts/delete/{$attempt->id}")->assertOk();

        $show = $this->getJson("/api/quiz/{$attempt->access_token}");
        $show->assertStatus(410);
        $show->assertJsonPath('status', false);
        $this->assertStringNotContainsString('revoke', strtolower((string) $show->json('message') . ''));
        $this->assertStringNotContainsString($owner->name, (string) $show->json('message'));

        $this->postJson("/api/quiz/{$attempt->access_token}/start")->assertStatus(410);
    }
}
