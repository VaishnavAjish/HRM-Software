<?php

namespace Tests\Feature;

use App\Models\CandidateAccount;
use App\Models\CandidateEducation;
use App\Models\CandidateExperience;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class CandidateExperienceEducationApiTest extends TestCase
{
    use RefreshDatabase;

    private function account(string $email = 'jane@profile.test'): CandidateAccount
    {
        return CandidateAccount::create(['name' => 'Jane Candidate', 'email' => $email, 'password' => 'password123']);
    }

    private function token(CandidateAccount $account): string
    {
        return $account->createToken('candidate_auth')->plainTextToken;
    }

    #[Test]
    public function a_candidate_can_create_list_update_and_delete_their_own_experience(): void
    {
        $account = $this->account();
        $token = $this->token($account);

        $store = $this->withToken($token)->postJson('/api/candidate/experiences', [
            'company' => 'Acme Corp', 'designation' => 'Software Engineer',
            'location' => 'Surat', 'start_date' => '2022-01-01', 'is_current' => true,
        ]);
        $store->assertCreated();
        $id = $store->json('data.id');

        $this->withToken($token)->getJson('/api/candidate/experiences')
            ->assertOk()->assertJsonPath('data.0.company', 'Acme Corp')->assertJsonPath('data.0.is_current', true);

        $this->withToken($token)->putJson("/api/candidate/experiences/{$id}", [
            'company' => 'Acme Corp', 'designation' => 'Senior Software Engineer',
            'start_date' => '2022-01-01', 'end_date' => '2024-06-01', 'is_current' => false,
        ])->assertOk()->assertJsonPath('data.designation', 'Senior Software Engineer');

        $this->assertDatabaseHas('candidate_experiences', ['id' => $id, 'is_current' => false, 'designation' => 'Senior Software Engineer']);

        $this->withToken($token)->deleteJson("/api/candidate/experiences/{$id}")->assertOk();
        $this->assertDatabaseMissing('candidate_experiences', ['id' => $id]);
    }

    #[Test]
    public function an_experience_that_is_not_current_requires_an_end_date(): void
    {
        $token = $this->token($this->account());

        $this->withToken($token)->postJson('/api/candidate/experiences', [
            'company' => 'Acme Corp', 'designation' => 'Software Engineer',
            'start_date' => '2022-01-01', 'is_current' => false,
        ])->assertStatus(422);
    }

    #[Test]
    public function a_candidate_cannot_edit_or_delete_another_candidates_experience(): void
    {
        $owner = $this->account('owner@profile.test');
        $intruder = $this->account('intruder@profile.test');

        $experience = CandidateExperience::create([
            'candidate_account_id' => $owner->id, 'company' => 'Acme Corp', 'designation' => 'Engineer',
            'start_date' => '2022-01-01', 'is_current' => true,
        ]);

        $intruderToken = $this->token($intruder);

        $this->withToken($intruderToken)->putJson("/api/candidate/experiences/{$experience->id}", [
            'company' => 'Hijacked', 'designation' => 'Hijacked', 'start_date' => '2022-01-01', 'is_current' => true,
        ])->assertStatus(404);

        $this->withToken($intruderToken)->deleteJson("/api/candidate/experiences/{$experience->id}")->assertStatus(404);

        $this->assertDatabaseHas('candidate_experiences', ['id' => $experience->id, 'company' => 'Acme Corp']);
    }

    #[Test]
    public function a_candidate_can_create_list_update_and_delete_their_own_education(): void
    {
        $account = $this->account();
        $token = $this->token($account);

        $store = $this->withToken($token)->postJson('/api/candidate/educations', [
            'institution' => 'Gujarat University', 'degree' => 'B.Tech', 'field_of_study' => 'Computer Science',
            'start_year' => 2018, 'end_year' => 2022, 'grade' => '8.2 CGPA',
        ]);
        $store->assertCreated();
        $id = $store->json('data.id');

        $this->withToken($token)->getJson('/api/candidate/educations')
            ->assertOk()->assertJsonPath('data.0.institution', 'Gujarat University');

        $this->withToken($token)->putJson("/api/candidate/educations/{$id}", [
            'institution' => 'Gujarat University', 'degree' => 'M.Tech', 'start_year' => 2018, 'end_year' => 2024,
        ])->assertOk()->assertJsonPath('data.degree', 'M.Tech');

        $this->withToken($token)->deleteJson("/api/candidate/educations/{$id}")->assertOk();
        $this->assertDatabaseMissing('candidate_educations', ['id' => $id]);
    }

    #[Test]
    public function a_candidate_cannot_read_or_modify_another_candidates_education(): void
    {
        $owner = $this->account('owner2@profile.test');
        $intruder = $this->account('intruder2@profile.test');

        $education = CandidateEducation::create([
            'candidate_account_id' => $owner->id, 'institution' => 'Gujarat University',
            'degree' => 'B.Tech', 'start_year' => 2018,
        ]);

        $intruderToken = $this->token($intruder);

        $this->withToken($intruderToken)->getJson('/api/candidate/educations')->assertOk()->assertJsonCount(0, 'data');

        $this->withToken($intruderToken)->deleteJson("/api/candidate/educations/{$education->id}")->assertStatus(404);
        $this->assertDatabaseHas('candidate_educations', ['id' => $education->id]);
    }
}
