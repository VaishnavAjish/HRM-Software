<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\Hr\QuizAttemptController;
use App\Mail\AssessmentInviteMail;
use App\Models\Candidate;
use App\Models\QuizAttempt;
use App\Models\TrainingQuiz;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * FRONTEND_URL being unset also broke this mailer (same missing config as
 * the candidate verification email). QuizAttemptController deliberately
 * degrades instead of hard-failing here — see config/services.php's
 * "left null-safe on purpose" comment — since the invite email still carries
 * useful info (role, duration, passing score) without the link.
 */
class AssessmentInviteMailTest extends TestCase
{
    use RefreshDatabase;

    private function actor(): User
    {
        return User::create([
            'name' => 'HR Actor',
            'email' => 'hr-actor@test.local',
            'password' => 'x',
            'role' => 1,
            'company_code' => 'alpha',
            'unit' => 'Ichapur',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    private function candidateApplicant(): Candidate
    {
        $id = DB::table('candidates')->insertGetId([
            'name' => 'Applicant',
            'stage' => 'applied',
            'email' => 'applicant@test.local',
            'company_code' => 'alpha',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return Candidate::find($id);
    }

    private function quiz(): TrainingQuiz
    {
        return TrainingQuiz::create([
            'title' => 'Backend Screening',
            'passing_score' => 60,
            'duration_minutes' => 30,
            'is_active' => true,
            'questions' => [
                ['text' => 'Q1', 'options' => ['A', 'B'], 'correct_index' => 0],
            ],
            'company_code' => 'alpha',
        ]);
    }

    #[Test]
    public function invite_link_uses_the_configured_frontend_url_and_correct_route(): void
    {
        Config::set('services.frontend_url', 'https://careers.test');
        Mail::fake();
        auth('api')->login($this->actor());
        $candidate = $this->candidateApplicant();
        $quiz = $this->quiz();

        $controller = new QuizAttemptController();
        $response = $controller->store(Request::create('/x', 'POST', [
            'quiz_id' => $quiz->id,
            'candidate_id' => $candidate->id,
        ]));

        $this->assertTrue($response->getData()->status);
        $token = $response->getData()->data->access_token;

        Mail::assertSent(AssessmentInviteMail::class, fn ($mail) => $mail->hasTo('applicant@test.local')
            && $mail->quizUrl === "https://careers.test/quiz/{$token}");

        // The invite link must resolve on the candidate-facing endpoint.
        $this->getJson("/api/quiz/{$token}")->assertOk()->assertJson(['status' => true]);
    }

    #[Test]
    public function invite_still_sends_without_a_link_when_frontend_url_is_unconfigured(): void
    {
        Config::set('services.frontend_url', null);
        Mail::fake();
        auth('api')->login($this->actor());
        $candidate = $this->candidateApplicant();
        $quiz = $this->quiz();

        $controller = new QuizAttemptController();
        $response = $controller->store(Request::create('/x', 'POST', [
            'quiz_id' => $quiz->id,
            'candidate_id' => $candidate->id,
        ]));

        $this->assertTrue($response->getData()->status);
        Mail::assertSent(AssessmentInviteMail::class, fn ($mail) => $mail->hasTo('applicant@test.local') && $mail->quizUrl === null);
    }

    #[Test]
    public function an_expired_pending_link_is_rejected_on_open(): void
    {
        $candidate = $this->candidateApplicant();
        $quiz = $this->quiz();
        $attempt = QuizAttempt::create([
            'quiz_id' => $quiz->id,
            'candidate_id' => $candidate->id,
            'access_token' => str_repeat('a', 64),
            'status' => 'pending',
            'duration_minutes' => 30,
            'total_questions' => 1,
            'link_expires_at' => now()->subDay(),
            'company_code' => 'alpha',
        ]);

        $this->getJson("/api/quiz/{$attempt->access_token}")->assertOk();

        $this->assertSame('expired', $attempt->fresh()->status);
    }

    #[Test]
    public function an_unknown_token_is_rejected(): void
    {
        $this->getJson('/api/quiz/'.str_repeat('b', 64))
            ->assertStatus(404)
            ->assertJson(['status' => false]);
    }
}
