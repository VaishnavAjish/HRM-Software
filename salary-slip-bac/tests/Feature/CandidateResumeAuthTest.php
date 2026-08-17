<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\Hr\CandidateController;
use App\Models\Candidate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use ReflectionMethod;
use Tests\TestCase;

class CandidateResumeAuthTest extends TestCase
{
    use RefreshDatabase;

    private function candidate(string $companyCode): Candidate
    {
        $id = DB::table('candidates')->insertGetId([
            'name' => 'Applicant',
            'stage' => 'applied',
            'company_code' => $companyCode,
            'resume_path' => 'candidate-documents/nonexistent.pdf',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return Candidate::find($id);
    }

    private function actor(int $role, string $companyCode): User
    {
        static $seq = 0;
        $seq++;

        return User::create([
            'name' => "Actor {$seq}",
            'email' => "cand-auth-{$seq}@test.local",
            'password' => 'x',
            'role' => $role,
            'company_code' => $companyCode,
            'unit' => 'Ichapur',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    private function withinScope(User $actor, Candidate $candidate): bool
    {
        auth('api')->login($actor);

        $method = new ReflectionMethod(CandidateController::class, 'candidateWithinActorScope');
        $method->setAccessible(true);

        return $method->invoke(app(CandidateController::class), $candidate);
    }

    public function test_resume_route_is_not_reachable_anonymously(): void
    {
        $candidate = $this->candidate('alpha');

        $this->getJson("/api/v1/candidates/{$candidate->id}/resume")->assertStatus(401);
        $this->getJson("/api/candidates/{$candidate->id}/resume")->assertStatus(401);
    }

    public function test_a_scoped_actor_is_out_of_scope_for_another_companys_candidate(): void
    {
        $candidate = $this->candidate('beta');
        $actor = $this->actor(3, 'alpha');

        $this->assertFalse($this->withinScope($actor, $candidate));
    }

    public function test_a_scoped_actor_is_in_scope_for_its_own_companys_candidate(): void
    {
        $candidate = $this->candidate('alpha');
        $actor = $this->actor(3, 'alpha');

        $this->assertTrue($this->withinScope($actor, $candidate));
    }

    public function test_a_scoped_actor_matches_a_candidate_stored_with_a_comma_joined_company(): void
    {
        $candidate = $this->candidate('alpha,beta');
        $actor = $this->actor(3, 'beta');

        $this->assertTrue($this->withinScope($actor, $candidate));
    }

    public function test_a_global_actor_is_in_scope_for_any_candidate(): void
    {
        $candidate = $this->candidate('beta');
        $actor = $this->actor(1, 'alpha');

        $this->assertTrue($this->withinScope($actor, $candidate));
    }

    public function test_a_candidate_with_no_company_is_not_disclosed_to_a_scoped_actor(): void
    {
        $candidate = $this->candidate('');
        $actor = $this->actor(3, 'alpha');

        $this->assertFalse($this->withinScope($actor, $candidate));
    }
}
