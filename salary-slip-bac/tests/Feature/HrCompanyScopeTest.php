<?php

namespace Tests\Feature;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class HrCompanyScopeTest extends TestCase
{
    use RefreshDatabase;

    private object $scoper;

    protected function setUp(): void
    {
        parent::setUp();

        $this->scoper = new class {
            use ScopesCompany {
                applyCompanyScope as public;
            }
        };

        foreach ([
            ['name' => 'Alpha Only', 'company_code' => 'alpha'],
            ['name' => 'Beta Only', 'company_code' => 'beta'],
            ['name' => 'Both', 'company_code' => 'alpha,beta'],
            ['name' => 'Unassigned', 'company_code' => null],
        ] as $row) {
            DB::table('candidates')->insert($row + [
                'stage' => 'applied',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    private function namesFor(User $actor, array $query = []): array
    {
        auth('api')->login($actor);

        $builder = DB::table('candidates');
        $this->scoper->applyCompanyScope($builder, Request::create('/', 'GET', $query));

        return $builder->orderBy('name')->pluck('name')->all();
    }

    private function actor(int $role, ?string $companyCode): User
    {
        $n = ++self::$seq;

        return User::create([
            'name' => "Scope Actor {$n}",
            'email' => "hr-scope-{$n}@test.local",
            'password' => 'x',
            'role' => $role,
            'company_code' => $companyCode,
            'unit' => 'Ichapur',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    private static int $seq = 0;

    public function test_a_scoped_actor_sees_only_their_own_companies_when_no_filter_is_sent(): void
    {
        $names = $this->namesFor($this->actor(3, 'alpha'));

        $this->assertSame(['Alpha Only', 'Both'], $names);
    }

    public function test_company_code_all_cannot_widen_a_scoped_actor_beyond_their_own_companies(): void
    {
        $names = $this->namesFor($this->actor(3, 'alpha'), ['company_code' => 'all']);

        $this->assertSame(['Alpha Only', 'Both'], $names);
        $this->assertNotContains('Beta Only', $names);
    }

    public function test_a_scoped_actor_cannot_request_a_company_they_do_not_hold(): void
    {
        $names = $this->namesFor($this->actor(3, 'alpha'), ['company_code' => 'beta']);

        $this->assertSame([], $names);
    }

    public function test_a_requested_company_narrows_within_the_actors_own_scope(): void
    {
        $names = $this->namesFor($this->actor(3, 'alpha,beta'), ['company_code' => 'beta']);

        $this->assertSame(['Beta Only', 'Both'], $names);
    }

    public function test_membership_matching_finds_rows_whose_company_code_is_comma_joined(): void
    {
        $names = $this->namesFor($this->actor(3, 'beta'));

        $this->assertContains('Both', $names);
    }

    public function test_rows_with_no_company_are_not_handed_to_a_scoped_actor(): void
    {
        $names = $this->namesFor($this->actor(3, 'alpha'));

        $this->assertNotContains('Unassigned', $names);
    }

    public function test_a_global_tier_actor_keeps_cross_company_reach(): void
    {
        $names = $this->namesFor($this->actor(1, 'alpha'));

        $this->assertSame(['Alpha Only', 'Beta Only', 'Both', 'Unassigned'], $names);
    }

    public function test_an_all_companies_account_is_treated_as_global(): void
    {
        $names = $this->namesFor($this->actor(3, 'all-companies'));

        $this->assertSame(['Alpha Only', 'Beta Only', 'Both', 'Unassigned'], $names);
    }

    public function test_a_global_actor_can_still_narrow_to_one_company(): void
    {
        $names = $this->namesFor($this->actor(1, 'alpha'), ['company_code' => 'beta']);

        $this->assertSame(['Beta Only', 'Both'], $names);
    }
}
