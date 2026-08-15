<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\Hr\CandidateCrmController;
use App\Models\Candidate;
use App\Models\CandidateCommunication;
use App\Models\CandidateNote;
use App\Models\CandidateTag;
use App\Models\TalentPool;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class CandidateCrmTest extends TestCase
{
    use RefreshDatabase;

    private function candidate(string $companyCode): Candidate
    {
        $id = DB::table('candidates')->insertGetId([
            'name' => 'Applicant',
            'stage' => 'applied',
            'email' => 'applicant@test.local',
            'company_code' => $companyCode,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return Candidate::find($id);
    }

    private function actor(string $companyCode = 'alpha'): User
    {
        static $seq = 0;
        $seq++;

        return User::create([
            'name' => "CRM Actor {$seq}",
            'email' => "crm-actor-{$seq}@test.local",
            'password' => 'x',
            'role' => 3,
            'company_code' => $companyCode,
            'unit' => 'Ichapur',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    private function login(): User
    {
        $actor = $this->actor();
        auth('api')->login($actor);

        return $actor;
    }

    public function test_crm_routes_are_not_reachable_anonymously(): void
    {
        $candidate = $this->candidate('alpha');

        $this->getJson('/api/hr/candidates/tags')->assertStatus(401);
        $this->getJson("/api/hr/candidates/notes/get/{$candidate->id}")->assertStatus(401);
        $this->getJson('/api/hr/candidates/pools')->assertStatus(401);
        $this->getJson("/api/hr/candidates/communications/get/{$candidate->id}")->assertStatus(401);
    }

    public function test_tag_lifecycle_and_candidate_sync(): void
    {
        $controller = new CandidateCrmController();
        $this->login();

        $created = $controller->storeTag(Request::create('/x', 'POST', ['name' => 'Urgent', 'color' => '#ef4444']));
        $this->assertTrue($created->getData()->status);
        $tag = CandidateTag::where('name', 'Urgent')->first();
        $this->assertNotNull($tag);
        $this->assertSame('alpha', $tag->company_code);

        $candidate = $this->candidate('alpha');
        $sync = $controller->syncCandidateTags(Request::create('/x', 'POST', ['tag_ids' => [$tag->id]]), $candidate->id);
        $this->assertTrue($sync->getData()->status);
        $this->assertCount(1, $candidate->fresh()->tags);

        $controller->syncCandidateTags(Request::create('/x', 'POST', ['tag_ids' => []]), $candidate->id);
        $this->assertCount(0, $candidate->fresh()->tags);
    }

    public function test_note_is_recorded_with_author(): void
    {
        $controller = new CandidateCrmController();
        $actor = $this->login();
        $candidate = $this->candidate('alpha');

        $created = $controller->storeNote(Request::create('/x', 'POST', ['note' => 'Strong fit for the role']), $candidate->id);
        $this->assertTrue($created->getData()->status);

        $note = CandidateNote::where('candidate_id', $candidate->id)->first();
        $this->assertNotNull($note);
        $this->assertSame('Strong fit for the role', $note->note);
        $this->assertSame($actor->id, $note->created_by);

        $list = $controller->notes($candidate->id);
        $this->assertCount(1, $list->getData()->data);

        $controller->destroyNote($note->id);
        $this->assertCount(0, $controller->notes($candidate->id)->getData()->data);
    }

    public function test_talent_pool_membership(): void
    {
        $controller = new CandidateCrmController();
        $this->login();
        $candidate = $this->candidate('alpha');

        $created = $controller->storePool(Request::create('/x', 'POST', ['name' => 'Engineering 2026', 'description' => 'Backend engineers']));
        $this->assertTrue($created->getData()->status);
        $pool = TalentPool::where('name', 'Engineering 2026')->first();
        $this->assertNotNull($pool);

        $controller->syncCandidatePools(Request::create('/x', 'POST', ['pool_ids' => [$pool->id]]), $candidate->id);
        $this->assertCount(1, $candidate->fresh()->talentPools);
        $this->assertCount(1, $controller->poolCandidates(Request::create('/x'), $pool->id)->getData()->data);

        $controller->removeCandidateFromPool(Request::create('/x', 'DELETE'), $candidate->id, $pool->id);
        $this->assertCount(0, $candidate->fresh()->talentPools);
    }

    public function test_add_candidate_to_pool_does_not_detach_other_pools(): void
    {
        $controller = new CandidateCrmController();
        $actor = $this->login();
        $candidate = $this->candidate('alpha');

        $first = TalentPool::create(['name' => 'First', 'company_code' => 'alpha', 'created_by' => $actor->id]);
        $second = TalentPool::create(['name' => 'Second', 'company_code' => 'alpha', 'created_by' => $actor->id]);

        $controller->syncCandidatePools(Request::create('/x', 'POST', ['pool_ids' => [$first->id]]), $candidate->id);
        $controller->addCandidateToPool(Request::create('/x', 'POST'), $candidate->id, $second->id);

        $poolIds = $candidate->fresh()->talentPools->pluck('id')->all();
        $this->assertContains($first->id, $poolIds);
        $this->assertContains($second->id, $poolIds);
    }

    public function test_communication_is_logged_and_marked_sent(): void
    {
        $controller = new CandidateCrmController();
        $actor = $this->login();
        $candidate = $this->candidate('alpha');

        $created = $controller->storeCommunication(Request::create('/x', 'POST', [
            'type' => 'email',
            'subject' => 'Interview update',
            'body' => 'Please confirm your availability.',
        ]), $candidate->id);
        $this->assertTrue($created->getData()->status);

        $comm = CandidateCommunication::where('candidate_id', $candidate->id)->first();
        $this->assertNotNull($comm);
        $this->assertSame(CandidateCommunication::STATUS_SENT, $comm->status);
        $this->assertSame($actor->id, $comm->sent_by);
        $this->assertNotNull($comm->sent_at);

        $list = $controller->communications($candidate->id);
        $this->assertCount(1, $list->getData()->data);
    }

    public function test_scoped_actor_cannot_manage_another_companys_candidate(): void
    {
        $controller = new CandidateCrmController();
        $this->actor('alpha');
        auth('api')->login($this->actor('beta'));

        $candidate = $this->candidate('alpha');
        $this->assertNull($controller->notes($candidate->id)->getData()->data ?? null);
    }
}