<?php

namespace Tests\Feature;

use App\Models\CandidateAccount;
use App\Models\CandidateSavedJob;
use App\Models\JobRequisition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CandidateSavedJobsApiTest extends TestCase
{
    use RefreshDatabase;

    private function account(string $email = 'jane@saved.test'): CandidateAccount
    {
        return CandidateAccount::create(['name' => 'Jane Candidate', 'email' => $email, 'password' => 'password123']);
    }

    private function job(array $overrides = []): JobRequisition
    {
        return JobRequisition::create(array_merge([
            'title' => 'Senior Software Engineer',
            'employment_type' => 'full_time',
            'status' => 'published',
            'company_code' => 'nidhi-impex',
        ], $overrides));
    }

    #[Test]
    public function a_candidate_can_save_a_published_job_and_see_it_in_the_list(): void
    {
        $account = $this->account();
        $job = $this->job();
        $token = $account->createToken('candidate_auth')->plainTextToken;

        $this->withToken($token)->postJson("/api/candidate/jobs/{$job->id}/save")->assertCreated();

        $response = $this->withToken($token)->getJson('/api/candidate/saved-jobs');
        $response->assertOk();
        $response->assertJsonPath('data.0.job.id', $job->id);
        $response->assertJsonPath('data.0.is_open', true);
    }

    #[Test]
    public function saving_the_same_job_twice_is_idempotent(): void
    {
        $account = $this->account();
        $job = $this->job();
        $token = $account->createToken('candidate_auth')->plainTextToken;

        $this->withToken($token)->postJson("/api/candidate/jobs/{$job->id}/save")->assertCreated();
        $this->withToken($token)->postJson("/api/candidate/jobs/{$job->id}/save")->assertCreated();

        $this->assertSame(1, CandidateSavedJob::where('candidate_account_id', $account->id)->count());
    }

    #[Test]
    public function a_candidate_cannot_save_an_unpublished_job(): void
    {
        $account = $this->account();
        $job = $this->job(['status' => 'draft']);
        $token = $account->createToken('candidate_auth')->plainTextToken;

        $this->withToken($token)->postJson("/api/candidate/jobs/{$job->id}/save")->assertStatus(404);
    }

    #[Test]
    public function a_candidate_can_remove_a_saved_job(): void
    {
        $account = $this->account();
        $job = $this->job();
        $token = $account->createToken('candidate_auth')->plainTextToken;

        $this->withToken($token)->postJson("/api/candidate/jobs/{$job->id}/save")->assertCreated();
        $this->withToken($token)->deleteJson("/api/candidate/jobs/{$job->id}/save")->assertOk();

        $this->assertSame(0, CandidateSavedJob::where('candidate_account_id', $account->id)->count());
    }

    #[Test]
    public function a_candidate_can_remove_a_saved_job_even_after_it_closes(): void
    {
        $account = $this->account();
        $job = $this->job();
        $token = $account->createToken('candidate_auth')->plainTextToken;
        $this->withToken($token)->postJson("/api/candidate/jobs/{$job->id}/save")->assertCreated();

        $job->update(['status' => 'closed']);

        $this->withToken($token)->deleteJson("/api/candidate/jobs/{$job->id}/save")->assertOk();
        $this->assertSame(0, CandidateSavedJob::where('candidate_account_id', $account->id)->count());
    }

    #[Test]
    public function a_candidate_cannot_see_or_remove_another_candidates_saved_job(): void
    {
        $owner = $this->account('owner@saved.test');
        $intruder = $this->account('intruder@saved.test');
        $job = $this->job();
        $ownerToken = $owner->createToken('candidate_auth')->plainTextToken;
        $intruderToken = $intruder->createToken('candidate_auth')->plainTextToken;

        $this->withToken($ownerToken)->postJson("/api/candidate/jobs/{$job->id}/save")->assertCreated();

        $response = $this->withToken($intruderToken)->getJson('/api/candidate/saved-jobs');
        $response->assertOk()->assertJsonCount(0, 'data');

        $this->withToken($intruderToken)->deleteJson("/api/candidate/jobs/{$job->id}/save")->assertOk();
        $this->assertSame(1, CandidateSavedJob::where('candidate_account_id', $owner->id)->count());
    }

    #[Test]
    public function saved_jobs_reflect_when_a_job_closes_after_saving(): void
    {
        $account = $this->account();
        $job = $this->job(['target_closing_date' => now()->subDay()->toDateString()]);
        // Job already past closing date cannot be saved fresh (matches apply()'s closing-date gate
        // being enforced at PublicJobController::index() visibility, not at save-time) — so save it
        // while open, then simulate it closing.
        $job->update(['target_closing_date' => null]);
        $token = $account->createToken('candidate_auth')->plainTextToken;
        $this->withToken($token)->postJson("/api/candidate/jobs/{$job->id}/save")->assertCreated();

        $job->update(['target_closing_date' => now()->subDay()->toDateString()]);

        $response = $this->withToken($token)->getJson('/api/candidate/saved-jobs');
        $response->assertOk();
        $response->assertJsonPath('data.0.is_open', false);
    }
}
