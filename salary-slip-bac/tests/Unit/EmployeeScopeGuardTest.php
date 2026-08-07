<?php

namespace Tests\Unit;

use App\Models\User;
use App\Services\Authorization\Matrix\EmployeeScopeGuard;
use PHPUnit\Framework\TestCase;

/**
 * Cross-company protection for employee-targeting HR writes.
 *
 * The asset and exit endpoints validated their target only with
 * `exists:users,id`, which proves an employee exists and nothing about who may
 * touch them — so an actor scoped to one company could allocate assets to, and
 * record a resignation against, employees of another. These cases pin the rule
 * that closed it.
 *
 * Unsaved models are used deliberately: the guard reads attributes only, so the
 * whole contract is testable without a database.
 */
class EmployeeScopeGuardTest extends TestCase
{
    private EmployeeScopeGuard $guard;

    protected function setUp(): void
    {
        parent::setUp();
        $this->guard = new EmployeeScopeGuard();
    }

    private function user(array $attributes): User
    {
        $user = new User();

        foreach ($attributes as $key => $value) {
            $user->setAttribute($key, $value);
        }

        return $user;
    }

    public function test_an_actor_may_target_an_employee_in_its_own_company(): void
    {
        $actor = $this->user(['id' => 1, 'role' => 1, 'company_code' => 'nidhi-impex']);
        $target = $this->user(['id' => 2, 'role' => 3, 'company_code' => 'nidhi-impex']);

        $this->assertTrue($this->guard->allows($actor, $target));
    }

    public function test_an_actor_may_not_target_an_employee_of_another_company(): void
    {
        $actor = $this->user(['id' => 1, 'role' => 1, 'company_code' => 'nidhi-impex']);
        $target = $this->user(['id' => 2, 'role' => 3, 'company_code' => 'other-company']);

        $this->assertFalse($this->guard->allows($actor, $target));
        $this->assertSame(EmployeeScopeGuard::DENIED_COMPANY, $this->guard->check($actor, $target));
    }

    public function test_a_target_that_exists_is_still_denied_when_out_of_company(): void
    {
        // The whole point of the patch: existence is validation, not authorization.
        $actor = $this->user(['id' => 1, 'role' => 1, 'company_code' => 'alpha']);
        $existingButForeign = $this->user(['id' => 999, 'role' => 3, 'company_code' => 'beta']);

        $this->assertFalse($this->guard->allows($actor, $existingButForeign));
    }

    public function test_a_multi_company_actor_may_target_any_of_its_companies(): void
    {
        $actor = $this->user(['id' => 1, 'role' => 1, 'company_code' => 'alpha,beta']);

        $this->assertTrue($this->guard->allows($actor, $this->user(['company_code' => 'alpha'])));
        $this->assertTrue($this->guard->allows($actor, $this->user(['company_code' => 'beta'])));
        $this->assertFalse($this->guard->allows($actor, $this->user(['company_code' => 'gamma'])));
    }

    public function test_both_companies_comes_from_the_actor_not_the_request(): void
    {
        $global = $this->user(['id' => 1, 'role' => 1, 'company_code' => 'all-companies']);
        $scoped = $this->user(['id' => 2, 'role' => 1, 'company_code' => 'alpha']);
        $target = $this->user(['company_code' => 'gamma']);

        $this->assertTrue($this->guard->allows($global, $target));

        // A scoped actor cannot reach another company however the request is
        // shaped; the guard never reads a company parameter.
        $this->assertFalse($this->guard->allows($scoped, $target));
    }

    public function test_a_super_admin_may_target_any_employee(): void
    {
        $actor = $this->user(['id' => 1, 'role' => 0, 'company_code' => 'alpha']);

        $this->assertTrue($this->guard->allows($actor, $this->user(['company_code' => 'gamma'])));
    }

    public function test_role_two_is_additionally_confined_to_its_unit(): void
    {
        $actor = $this->user(['id' => 1, 'role' => 2, 'company_code' => 'alpha', 'unit' => 'unit-a']);

        $this->assertTrue($this->guard->allows($actor, $this->user(['company_code' => 'alpha', 'unit' => 'unit-a'])));
        $this->assertSame(
            EmployeeScopeGuard::DENIED_UNIT,
            $this->guard->check($actor, $this->user(['company_code' => 'alpha', 'unit' => 'unit-b'])),
        );
    }

    public function test_an_actor_with_no_company_cannot_reach_a_scoped_employee(): void
    {
        $actor = $this->user(['id' => 1, 'role' => 1, 'company_code' => '']);

        $this->assertFalse($this->guard->allows($actor, $this->user(['company_code' => 'alpha'])));
    }

    public function test_an_unauthenticated_actor_is_denied(): void
    {
        $this->assertFalse($this->guard->allows(null, $this->user(['company_code' => 'alpha'])));
        $this->assertSame(EmployeeScopeGuard::DENIED_NO_ACTOR, $this->guard->check(null, $this->user([])));
    }

    public function test_a_missing_target_is_not_a_scope_decision(): void
    {
        // Callers answer 404 for a non-existent employee; the guard must not turn
        // that into a scope denial and mask the difference.
        $actor = $this->user(['id' => 1, 'role' => 1, 'company_code' => 'alpha']);

        $this->assertSame(EmployeeScopeGuard::ALLOWED, $this->guard->check($actor, null));
    }

    /* ---- company-bound records: assets, resignations ---------------------- */

    public function test_a_record_in_the_actors_company_is_allowed(): void
    {
        $actor = $this->user(['id' => 1, 'role' => 1, 'company_code' => 'alpha']);

        $this->assertSame(EmployeeScopeGuard::ALLOWED, $this->guard->allowsCompany($actor, 'alpha'));
    }

    public function test_a_record_from_another_company_is_denied(): void
    {
        // A route id identifies an asset or resignation; it does not authorize it.
        $actor = $this->user(['id' => 1, 'role' => 1, 'company_code' => 'alpha']);

        $this->assertSame(EmployeeScopeGuard::DENIED_COMPANY, $this->guard->allowsCompany($actor, 'beta'));
    }

    public function test_an_untagged_record_is_allowed_rather_than_breaking_legacy_rows(): void
    {
        // Records created before company tagging carry no company; refusing them
        // would break existing data rather than protect anything.
        $actor = $this->user(['id' => 1, 'role' => 1, 'company_code' => 'alpha']);

        $this->assertSame(EmployeeScopeGuard::ALLOWED, $this->guard->allowsCompany($actor, null));
        $this->assertSame(EmployeeScopeGuard::ALLOWED, $this->guard->allowsCompany($actor, ''));
    }

    public function test_a_super_admin_may_operate_on_any_record(): void
    {
        $actor = $this->user(['id' => 1, 'role' => 0, 'company_code' => 'alpha']);

        $this->assertSame(EmployeeScopeGuard::ALLOWED, $this->guard->allowsCompany($actor, 'beta'));
    }

    public function test_record_scope_confines_role_two_to_its_unit(): void
    {
        $actor = $this->user(['id' => 1, 'role' => 2, 'company_code' => 'alpha', 'unit' => 'unit-a']);

        $this->assertSame(EmployeeScopeGuard::ALLOWED, $this->guard->allowsCompany($actor, 'alpha', 'unit-a'));
        $this->assertSame(EmployeeScopeGuard::DENIED_UNIT, $this->guard->allowsCompany($actor, 'alpha', 'unit-b'));
    }

    public function test_record_and_employee_rules_agree_on_a_foreign_company(): void
    {
        $actor = $this->user(['id' => 1, 'role' => 1, 'company_code' => 'alpha']);
        $foreign = $this->user(['id' => 2, 'company_code' => 'beta']);

        $this->assertSame(
            $this->guard->check($actor, $foreign),
            $this->guard->allowsCompany($actor, 'beta'),
        );
    }

    public function test_a_record_tagged_with_several_companies_is_reachable_by_each(): void
    {
        // Real assets and resignations are stamped from the creating admin's own
        // company_code, so a multi-company admin produces records tagged
        // "alpha,beta". Both single-company admins manage those records today and
        // exact string matching would lock them out.
        $alpha = $this->user(['id' => 1, 'role' => 1, 'company_code' => 'alpha']);
        $beta = $this->user(['id' => 2, 'role' => 1, 'company_code' => 'beta']);
        $gamma = $this->user(['id' => 3, 'role' => 1, 'company_code' => 'gamma']);

        $this->assertSame(EmployeeScopeGuard::ALLOWED, $this->guard->allowsCompany($alpha, 'alpha,beta'));
        $this->assertSame(EmployeeScopeGuard::ALLOWED, $this->guard->allowsCompany($beta, 'alpha,beta'));
        $this->assertSame(EmployeeScopeGuard::DENIED_COMPANY, $this->guard->allowsCompany($gamma, 'alpha,beta'));
    }

    public function test_the_guard_reports_itself_as_compatibility_not_canonical(): void
    {
        // It mirrors the legacy company rules rather than reaching ScopeMatcher,
        // and the inventory must not claim canonical scope because of it.
        $this->assertSame('COMPAT', EmployeeScopeGuard::MODE);
    }
}
