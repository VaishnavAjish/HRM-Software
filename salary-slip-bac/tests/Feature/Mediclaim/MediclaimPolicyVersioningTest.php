<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimEnrollment;
use App\Models\Mediclaim\MediclaimPolicy;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\User;
use App\Services\Mediclaim\ClaimWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * ClaimWorkflowService::submit() resolves the policy version effective on
 * the TREATMENT date (admission_at, via PolicyEligibilityService::
 * resolvePolicyVersionForDate()) rather than the submission date, and once
 * resolved that policy_version_id is a pinned FK on the claim — never
 * recomputed later, so publishing a newer/edited version afterward cannot
 * retroactively change an already-decided claim's result.
 */
class MediclaimPolicyVersioningTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function a_claim_resolves_the_policy_version_effective_on_the_treatment_date_not_todays_date(): void
    {
        $employee = $this->makeUser('Employee');
        $policy = MediclaimPolicy::create([
            'company_code' => 'nidhi-impex', 'policy_code' => 'POL-VER-1',
            'name' => 'Nidhi Impex Mediclaim', 'status' => 'active',
        ]);

        // Older, closed version — covers the treatment date used below.
        $olderVersion = MediclaimPolicyVersion::create([
            'policy_id' => $policy->id, 'version_number' => 1, 'status' => 'archived',
            'rules' => ['floater_limit_amount' => 200000, 'intimation_required_for_planned' => true],
            'effective_from' => '2022-01-01', 'effective_to' => '2022-12-31',
        ]);
        // Newer version — covers "today" (2026), NOT the 2022 treatment date.
        $newerVersion = MediclaimPolicyVersion::create([
            'policy_id' => $policy->id, 'version_number' => 2, 'status' => 'active',
            'rules' => ['floater_limit_amount' => 300000, 'intimation_required_for_planned' => true],
            'effective_from' => '2023-01-01', 'effective_to' => null,
        ]);

        MediclaimEnrollment::create([
            'policy_version_id' => $olderVersion->id, 'employee_user_id' => $employee->id,
            'company_code' => 'nidhi-impex', 'status' => 'active',
            'enrolled_at' => '2022-01-01', 'terminated_at' => '2022-12-31',
        ]);
        MediclaimEnrollment::create([
            'policy_version_id' => $newerVersion->id, 'employee_user_id' => $employee->id,
            'company_code' => 'nidhi-impex', 'status' => 'active',
            'enrolled_at' => '2023-01-01', 'terminated_at' => null,
        ]);

        $workflow = app(ClaimWorkflowService::class);
        $draft = $workflow->createDraft($employee, ['admission_at' => '2022-06-15 09:00:00']);
        $claim = $workflow->submit($draft, $employee);

        $this->assertSame(
            $olderVersion->id,
            $claim->policy_version_id,
            'The claim must resolve the version effective on the 2022 admission date, not the version effective today.'
        );
        $this->assertNotSame($newerVersion->id, $claim->policy_version_id);
    }

    #[Test]
    public function publishing_a_later_version_afterward_does_not_change_an_already_decided_claims_pinned_version(): void
    {
        $employee = $this->makeUser('Employee');
        $policy = MediclaimPolicy::create([
            'company_code' => 'nidhi-impex', 'policy_code' => 'POL-VER-2',
            'name' => 'Nidhi Impex Mediclaim', 'status' => 'active',
        ]);
        $v1 = MediclaimPolicyVersion::create([
            'policy_id' => $policy->id, 'version_number' => 1, 'status' => 'active',
            'rules' => ['floater_limit_amount' => 300000],
            'effective_from' => '2022-01-01', 'effective_to' => null,
        ]);
        MediclaimEnrollment::create([
            'policy_version_id' => $v1->id, 'employee_user_id' => $employee->id,
            'company_code' => 'nidhi-impex', 'status' => 'active', 'enrolled_at' => '2022-01-01',
        ]);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->submit(
            $workflow->createDraft($employee, ['admission_at' => '2024-05-01 09:00:00']),
            $employee
        );
        $this->assertSame($v1->id, $claim->policy_version_id);
        $pinnedRules = $claim->policyVersion->rules;
        $this->assertSame(300000, (int) $pinnedRules['floater_limit_amount']);

        // A later, higher-numbered version is published that ALSO covers the
        // same treatment date (simulating a retroactive edit/republish).
        MediclaimPolicyVersion::create([
            'policy_id' => $policy->id, 'version_number' => 2, 'status' => 'active',
            'rules' => ['floater_limit_amount' => 999999],
            'effective_from' => '2022-01-01', 'effective_to' => null,
        ]);

        $fresh = $claim->fresh();
        $this->assertSame($v1->id, $fresh->policy_version_id, 'An already-submitted claim must stay pinned to the version it resolved at submit time.');
        $this->assertSame(300000, (int) $fresh->policyVersion->rules['floater_limit_amount'], 'The pinned version\'s own rules must not have changed either.');
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-policyver-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCPV{$number}",
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'unit' => 'Surat',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }
}
