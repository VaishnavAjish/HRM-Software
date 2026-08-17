<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\CandidateAccount;
use App\Models\Interview;
use App\Models\JobRequisition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Candidate-facing read view onto the existing (admin-authored) interviews
 * table. Must never leak `notes` (recruiter prep notes), `created_by`,
 * Google Meet sync diagnostics, panelists, or feedback — and must enforce
 * strict per-candidate ownership (an interview belongs to a `Candidate`
 * application row, which belongs to exactly one `candidate_account`).
 */
class CandidateInterviewsApiTest extends TestCase
{
    use RefreshDatabase;

    private function account(string $email = 'jane@interview.test'): CandidateAccount
    {
        return CandidateAccount::create(['name' => 'Jane Candidate', 'email' => $email, 'password' => 'password123']);
    }

    private function applicationFor(CandidateAccount $account): Candidate
    {
        $requisition = JobRequisition::create([
            'title' => 'Senior Software Engineer', 'employment_type' => 'full_time',
            'status' => 'published', 'company_code' => 'nidhi-impex',
        ]);

        return Candidate::create([
            'requisition_id' => $requisition->id, 'candidate_account_id' => $account->id,
            'name' => $account->name, 'email' => $account->email, 'source' => 'job_portal',
            'stage' => 'interview', 'company_code' => 'nidhi-impex',
        ]);
    }

    #[Test]
    public function a_candidate_can_list_and_view_their_own_interview_without_internal_fields_leaking(): void
    {
        $account = $this->account();
        $candidate = $this->applicationFor($account);

        $interview = Interview::create([
            'candidate_id' => $candidate->id,
            'round_name' => 'Technical Round',
            'scheduled_at' => now()->addDays(3),
            'duration_minutes' => 45,
            'mode' => 'video',
            'meeting_link' => 'https://meet.example.com/abc-defg-hij',
            'status' => 'scheduled',
            'notes' => 'Ask about system design depth — candidate was weak on this in screening.',
            'google_event_id' => 'evt_internal_123',
            'meeting_status' => 'created',
        ]);

        $token = $account->createToken('candidate_auth')->plainTextToken;

        $listResponse = $this->withToken($token)->getJson('/api/candidate/interviews');
        $listResponse->assertOk()->assertJsonPath('data.0.id', $interview->id);
        $listResponse->assertJsonPath('data.0.meeting_link', 'https://meet.example.com/abc-defg-hij');
        $listResponse->assertJsonPath('data.0.job_title', 'Senior Software Engineer');

        $showResponse = $this->withToken($token)->getJson("/api/candidate/interviews/{$interview->id}");
        $showResponse->assertOk();

        $raw = $showResponse->getContent();
        $this->assertStringNotContainsString('system design depth', $raw);
        $this->assertStringNotContainsString('evt_internal_123', $raw);
        $this->assertStringNotContainsString('notes', $raw);
        $this->assertStringNotContainsString('google_event_id', $raw);
        $this->assertStringNotContainsString('created_by', $raw);
    }

    #[Test]
    public function a_phone_interview_never_returns_a_meeting_link(): void
    {
        $account = $this->account();
        $candidate = $this->applicationFor($account);

        $interview = Interview::create([
            'candidate_id' => $candidate->id, 'round_name' => 'HR Screen',
            'scheduled_at' => now()->addDay(), 'mode' => 'phone',
            'meeting_link' => 'https://leaked-if-not-filtered.example.com',
            'status' => 'scheduled',
        ]);

        $token = $account->createToken('candidate_auth')->plainTextToken;
        $response = $this->withToken($token)->getJson("/api/candidate/interviews/{$interview->id}");

        $response->assertOk()->assertJsonPath('data.meeting_link', null);
    }

    #[Test]
    public function a_candidate_cannot_read_another_candidates_interview(): void
    {
        $owner = $this->account('owner@interview.test');
        $intruder = $this->account('intruder@interview.test');
        $candidate = $this->applicationFor($owner);

        $interview = Interview::create([
            'candidate_id' => $candidate->id, 'round_name' => 'Final Round',
            'scheduled_at' => now()->addDays(2), 'mode' => 'onsite', 'status' => 'scheduled',
        ]);

        $intruderToken = $intruder->createToken('candidate_auth')->plainTextToken;

        $this->withToken($intruderToken)->getJson("/api/candidate/interviews/{$interview->id}")->assertStatus(404);

        $listResponse = $this->withToken($intruderToken)->getJson('/api/candidate/interviews');
        $listResponse->assertOk()->assertJsonCount(0, 'data');
    }
}
