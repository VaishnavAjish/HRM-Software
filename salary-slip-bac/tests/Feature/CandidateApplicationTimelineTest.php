<?php

namespace Tests\Feature;

use App\Models\Candidate;
use App\Models\CandidateAccount;
use App\Models\CandidateStageHistory;
use App\Models\JobRequisition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Career Portal application-detail page reads a candidate-safe progress
 * timeline built from `candidate_stage_history`. It must collapse
 * consecutive internal stages that map to the same public label (e.g.
 * screening -> shortlisted are both "Under Review") and must never leak
 * `notes` or `changed_by` — those carry recruiter commentary.
 */
class CandidateApplicationTimelineTest extends TestCase
{
    use RefreshDatabase;

    private function requisition(): JobRequisition
    {
        return JobRequisition::create([
            'title' => 'Senior Software Engineer',
            'employment_type' => 'full_time',
            'status' => 'published',
            'company_code' => 'nidhi-impex',
        ]);
    }

    private function account(): CandidateAccount
    {
        return CandidateAccount::create([
            'name' => 'Jane Candidate', 'email' => 'jane@timeline.test', 'password' => 'password123',
        ]);
    }

    #[Test]
    public function the_timeline_collapses_internal_stages_into_public_labels_in_order(): void
    {
        $requisition = $this->requisition();
        $account = $this->account();

        $candidate = Candidate::create([
            'requisition_id' => $requisition->id, 'candidate_account_id' => $account->id,
            'name' => $account->name, 'email' => $account->email, 'source' => 'job_portal',
            'stage' => 'interview', 'company_code' => 'nidhi-impex',
        ]);

        $recruiter = \App\Models\User::create([
            'name' => 'Recruiter Admin', 'email' => 'recruiter@niss.pro', 'password' => 'x',
            'role' => 1, 'company_code' => 'nidhi-impex', 'unit' => 'Shreeji', 'status' => 0, 'is_deleted' => 0,
        ]);

        // applied -> screening -> shortlisted (both "Under Review") -> interview
        CandidateStageHistory::create(['candidate_id' => $candidate->id, 'from_stage' => null, 'to_stage' => 'applied', 'notes' => 'Applied via Public Job Portal', 'created_at' => now()->subDays(3)]);
        CandidateStageHistory::create(['candidate_id' => $candidate->id, 'from_stage' => 'applied', 'to_stage' => 'screening', 'notes' => 'Recruiter picked up', 'changed_by' => $recruiter->id, 'created_at' => now()->subDays(2)]);
        CandidateStageHistory::create(['candidate_id' => $candidate->id, 'from_stage' => 'screening', 'to_stage' => 'shortlisted', 'notes' => 'Ranked #2 by ATS', 'changed_by' => $recruiter->id, 'created_at' => now()->subDays(1)]);
        CandidateStageHistory::create(['candidate_id' => $candidate->id, 'from_stage' => 'shortlisted', 'to_stage' => 'interview', 'notes' => 'Scheduled with panel', 'changed_by' => $recruiter->id, 'created_at' => now()]);

        $token = $account->createToken('candidate_auth')->plainTextToken;

        $response = $this->withToken($token)->getJson("/api/candidate/applications/{$candidate->id}");

        $response->assertOk();
        $response->assertJsonPath('data.timeline', [
            ['status_label' => 'Submitted', 'occurred_at' => $response->json('data.timeline.0.occurred_at')],
            ['status_label' => 'Under Review', 'occurred_at' => $response->json('data.timeline.1.occurred_at')],
            ['status_label' => 'Interview', 'occurred_at' => $response->json('data.timeline.2.occurred_at')],
        ]);

        $raw = $response->getContent();
        $this->assertStringNotContainsString('Recruiter picked up', $raw);
        $this->assertStringNotContainsString('Ranked #2 by ATS', $raw);
        $this->assertStringNotContainsString('changed_by', $raw);
        $this->assertStringNotContainsString('notes', $raw);
    }

    #[Test]
    public function a_candidate_cannot_read_another_candidates_application_timeline(): void
    {
        $requisition = $this->requisition();
        $owner = $this->account();
        $intruder = CandidateAccount::create(['name' => 'Intruder', 'email' => 'intruder@timeline.test', 'password' => 'password123']);

        $candidate = Candidate::create([
            'requisition_id' => $requisition->id, 'candidate_account_id' => $owner->id,
            'name' => $owner->name, 'email' => $owner->email, 'source' => 'job_portal',
            'stage' => 'applied', 'company_code' => 'nidhi-impex',
        ]);

        $token = $intruder->createToken('candidate_auth')->plainTextToken;

        $this->withToken($token)->getJson("/api/candidate/applications/{$candidate->id}")->assertStatus(404);
    }
}
