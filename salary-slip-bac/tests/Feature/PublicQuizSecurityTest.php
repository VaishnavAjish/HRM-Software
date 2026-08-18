<?php

namespace Tests\Feature;

use App\Models\AssessmentAuditLog;
use App\Models\Candidate;
use App\Models\QuizAttempt;
use App\Models\TrainingQuiz;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class PublicQuizSecurityTest extends TestCase
{
    use RefreshDatabase;

    private function owner(): User
    {
        return User::create([
            'name' => 'Root', 'email' => 'root-' . uniqid() . '@security.test', 'password' => 'secret1234',
            'emp_code' => 'SEC-ROOT-' . uniqid(), 'role' => 0, 'company_code' => 'nidhi-impex', 'status' => 0,
        ]);
    }

    private function candidate(string $email = 'jane@example.com'): Candidate
    {
        return Candidate::create([
            'name' => 'Jane Candidate', 'email' => $email, 'source' => 'job_portal',
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

    private function attempt(Candidate $candidate, TrainingQuiz $quiz, array $overrides = []): QuizAttempt
    {
        return QuizAttempt::create(array_merge([
            'quiz_id' => $quiz->id, 'candidate_id' => $candidate->id,
            'access_token' => \Illuminate\Support\Str::random(64), 'status' => 'pending',
            'duration_minutes' => $quiz->duration_minutes, 'total_questions' => count($quiz->questions),
            'link_expires_at' => now()->addDays(7),
            'company_code' => 'nidhi-impex', 'created_by' => $this->owner()->id,
        ], $overrides));
    }

    #[Test]
    public function a_malformed_token_is_rejected(): void
    {
        $this->getJson('/api/quiz/not-a-real-token')->assertStatus(404);
    }

    #[Test]
    public function a_token_cannot_reach_another_assignment(): void
    {
        $quiz = $this->quiz();
        $candidateA = $this->candidate('a@example.com');
        $candidateA->update(['name' => 'Candidate A']);
        $candidateB = $this->candidate('b@example.com');
        $candidateB->update(['name' => 'Candidate B']);
        $a = $this->attempt($candidateA, $quiz);
        $this->attempt($candidateB, $quiz);

        $response = $this->getJson("/api/quiz/{$a->access_token}");
        $response->assertOk();
        // The token itself is the only lookup key — fetching with a's token
        // must surface only a's candidate, never b's.
        $this->assertSame('Candidate A', $response->json('data.candidate_name'));
    }

    #[Test]
    public function an_expired_link_is_rejected_on_start(): void
    {
        $quiz = $this->quiz();
        $attempt = $this->attempt($this->candidate(), $quiz, ['link_expires_at' => now()->subDay()]);

        $response = $this->postJson("/api/quiz/{$attempt->access_token}/start");
        $response->assertStatus(422);
        $this->assertSame('expired', $attempt->fresh()->status);
    }

    #[Test]
    public function a_not_yet_open_assignment_gives_a_professional_message_not_an_exception(): void
    {
        $quiz = $this->quiz();
        $attempt = $this->attempt($this->candidate(), $quiz, ['scheduled_start_at' => now()->addDay()]);

        $response = $this->postJson("/api/quiz/{$attempt->access_token}/start");
        $response->assertStatus(422);
        $this->assertStringContainsString('not available yet', $response->json('message'));
    }

    #[Test]
    public function a_revoked_token_is_rejected(): void
    {
        $quiz = $this->quiz();
        $attempt = $this->attempt($this->candidate(), $quiz, ['status' => 'revoked']);

        $this->getJson("/api/quiz/{$attempt->access_token}")->assertStatus(410);
        $this->postJson("/api/quiz/{$attempt->access_token}/start")->assertStatus(410);
    }

    #[Test]
    public function an_already_completed_assignment_cannot_be_restarted(): void
    {
        $quiz = $this->quiz();
        $attempt = $this->attempt($this->candidate(), $quiz, ['status' => 'submitted', 'submitted_at' => now()]);

        $response = $this->postJson("/api/quiz/{$attempt->access_token}/start");
        $response->assertStatus(422);
        $this->assertStringContainsString('already been completed', $response->json('message'));
    }

    #[Test]
    public function the_raw_token_is_never_written_to_the_audit_log(): void
    {
        $owner = $this->owner();
        $quiz = $this->quiz();
        $candidate = $this->candidate();
        $token = $this->withToken(auth('api')->login($owner));

        $response = $token->postJson('/api/hr/quiz-attempts/store', [
            'quiz_id' => $quiz->id,
            'candidate_id' => $candidate->id,
        ]);
        $response->assertCreated();
        $accessToken = $response->json('data.access_token');

        $logs = AssessmentAuditLog::all();
        $this->assertNotEmpty($logs);
        foreach ($logs as $log) {
            $payload = json_encode($log->getAttributes());
            $this->assertStringNotContainsString($accessToken, $payload, 'raw access_token leaked into an audit log row');
        }
    }
}
