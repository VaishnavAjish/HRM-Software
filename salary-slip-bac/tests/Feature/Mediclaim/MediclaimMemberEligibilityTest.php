<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimEnrollment;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimPolicy;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\Permission;
use App\Models\User;
use App\Services\Mediclaim\MediclaimMemberService;
use App\Services\Mediclaim\PolicyEligibilityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * PolicyEligibilityService::validateMemberEligibility()'s age-boundary math
 * and MediclaimMemberService::decideChangeRequest()'s max-active-children /
 * single-active-spouse guards.
 *
 * IMPORTANT — real boundary semantics differ from a naive "birthday cutoff"
 * reading: the code compares `dob->diffInYears($treatmentDate) > $maxAge`
 * (a floor on COMPLETED years), never `addYears($max)->lte/lt($asOf)`. So a
 * child is still eligible ON their 18th birthday (diffInYears == 18, and
 * 18 is not > 18) and remains eligible every day up to their 19th birthday
 * — ineligibility starts exactly on the 19th birthday (diffInYears == 19).
 * The tests below assert this real boundary precisely, using explicit
 * Carbon dates rather than now().
 *
 * Also confirmed against the real code: there is no generic date-range
 * overlap guard for members of the same relationship_type. The only
 * "overlap" rule that exists is spouse-specific — at most one ACTIVE spouse
 * per enrollment — enforced in MediclaimMemberService::decideChangeRequest().
 * The last test below exercises that real mechanism rather than assuming a
 * generic overlap check that isn't actually implemented.
 */
class MediclaimMemberEligibilityTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function a_third_active_child_change_request_is_rejected(): void
    {
        [$employee, $hr, $enrollment, $version] = $this->policyAndEnrollment();

        MediclaimMember::create([
            'enrollment_id' => $enrollment->id, 'employee_user_id' => $employee->id,
            'full_name' => 'Child One', 'relationship_type' => 'child',
            'date_of_birth' => '2015-01-01', 'status' => 'active', 'effective_from' => '2020-01-01',
        ]);
        MediclaimMember::create([
            'enrollment_id' => $enrollment->id, 'employee_user_id' => $employee->id,
            'full_name' => 'Child Two', 'relationship_type' => 'child',
            'date_of_birth' => '2017-01-01', 'status' => 'active', 'effective_from' => '2020-01-01',
        ]);

        $this->grant($employee, ['self.mediclaim.member_change_request.create']);
        $this->grant($hr, ['mediclaim.member_change_request.decide']);

        $created = $this->actingAsUser($employee)
            ->postJson('/api/v1/mediclaim/me/member-change-requests', [
                'request_type' => 'add',
                'enrollment_id' => $enrollment->id,
                'proposed_values' => ['full_name' => 'Child Three', 'relationship_type' => 'child', 'date_of_birth' => '2019-01-01'],
                'effective_from' => '2024-01-01',
            ])->assertCreated()->json('data');

        $this->actingAsUser($hr)
            ->postJson("/api/v1/mediclaim/member-change-requests/{$created['id']}/decision", ['decision' => 'approve'])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['relationship_type']);

        $this->assertSame(2, MediclaimMember::where('enrollment_id', $enrollment->id)->where('status', 'active')->where('relationship_type', 'child')->count());
    }

    #[Test]
    public function a_child_is_eligible_on_and_through_their_18th_year_but_ineligible_from_their_19th_birthday(): void
    {
        [$employee, , $enrollment, $version] = $this->policyAndEnrollment();
        $eligibility = app(PolicyEligibilityService::class);

        $child = MediclaimMember::create([
            'enrollment_id' => $enrollment->id, 'employee_user_id' => $employee->id,
            'full_name' => 'Boundary Child', 'relationship_type' => 'child',
            'date_of_birth' => '2006-03-10', 'status' => 'active', 'effective_from' => '2006-03-10',
        ]);

        // Exactly the 18th birthday: diffInYears == 18, not > 18 -> eligible.
        $onEighteenthBirthday = Carbon::parse('2024-03-10');
        $this->assertTrue($eligibility->validateMemberEligibility($child, $version, $onEighteenthBirthday)['ok']);

        // The day before the 19th birthday: still 18 completed years -> eligible.
        $dayBeforeNineteenth = Carbon::parse('2025-03-09');
        $this->assertTrue($eligibility->validateMemberEligibility($child, $version, $dayBeforeNineteenth)['ok']);

        // Exactly the 19th birthday: diffInYears == 19 > 18 -> ineligible.
        $onNineteenthBirthday = Carbon::parse('2025-03-10');
        $result = $eligibility->validateMemberEligibility($child, $version, $onNineteenthBirthday);
        $this->assertFalse($result['ok']);
        $this->assertNotEmpty($result['reasons']);
    }

    #[Test]
    public function a_parent_is_covered_through_age_55_inclusive_and_excluded_at_56(): void
    {
        [$employee, , $enrollment, $version] = $this->policyAndEnrollment();
        $eligibility = app(PolicyEligibilityService::class);

        $parent = MediclaimMember::create([
            'enrollment_id' => $enrollment->id, 'employee_user_id' => $employee->id,
            'full_name' => 'Boundary Parent', 'relationship_type' => 'parent',
            'date_of_birth' => '1969-01-01', 'status' => 'active', 'effective_from' => '1969-01-01',
        ]);

        $onFiftyFifthBirthday = Carbon::parse('2024-01-01');
        $this->assertTrue($eligibility->validateMemberEligibility($parent, $version, $onFiftyFifthBirthday)['ok']);

        $onFiftySixthBirthday = Carbon::parse('2025-01-01');
        $result = $eligibility->validateMemberEligibility($parent, $version, $onFiftySixthBirthday);
        $this->assertFalse($result['ok']);
        $this->assertNotEmpty($result['reasons']);
    }

    #[Test]
    public function a_second_active_spouse_is_rejected_the_real_overlap_guard_is_spouse_uniqueness_not_a_date_range_check(): void
    {
        [$employee, $hr, $enrollment, $version] = $this->policyAndEnrollment();
        $memberService = app(MediclaimMemberService::class);

        $firstRequest = $memberService->submitChangeRequest($employee, [
            'request_type' => 'add',
            'enrollment_id' => $enrollment->id,
            'proposed_values' => ['full_name' => 'Spouse One', 'relationship_type' => 'spouse', 'date_of_birth' => '1990-01-01'],
            'effective_from' => '2024-01-01',
        ]);
        $memberService->decideChangeRequest($firstRequest, $hr, 'approve');

        $this->assertSame(1, MediclaimMember::where('enrollment_id', $enrollment->id)->where('relationship_type', 'spouse')->where('status', 'active')->count());

        $secondRequest = $memberService->submitChangeRequest($employee, [
            'request_type' => 'add',
            'enrollment_id' => $enrollment->id,
            'proposed_values' => ['full_name' => 'Spouse Two', 'relationship_type' => 'spouse', 'date_of_birth' => '1991-01-01'],
            'effective_from' => '2024-06-01',
        ]);

        $this->expectException(ValidationException::class);
        $memberService->decideChangeRequest($secondRequest, $hr, 'approve');
    }

    /** @return array{0:User,1:User,2:MediclaimEnrollment,3:MediclaimPolicyVersion} */
    private function policyAndEnrollment(): array
    {
        $employee = $this->makeUser('Employee');
        $hr = $this->makeUser('HR', ['role' => 1]);

        $policy = MediclaimPolicy::create([
            'company_code' => 'nidhi-impex', 'policy_code' => 'POL-' . self::$sequence,
            'name' => 'Nidhi Impex Mediclaim', 'insurer_name' => 'Test Insurer', 'status' => 'active',
        ]);
        $version = MediclaimPolicyVersion::create([
            'policy_id' => $policy->id, 'version_number' => 1, 'status' => 'active',
            'rules' => [
                'floater_limit_amount' => 300000,
                'max_covered_children' => 2,
                'child_max_age_years' => 18,
                'parent_max_age_years' => 55,
                'intimation_required_for_planned' => true,
            ],
            'effective_from' => '2020-01-01', 'effective_to' => null,
        ]);
        $enrollment = MediclaimEnrollment::create([
            'policy_version_id' => $version->id, 'employee_user_id' => $employee->id,
            'company_code' => 'nidhi-impex', 'status' => 'active', 'enrolled_at' => '2020-01-01',
        ]);

        return [$employee, $hr, $enrollment, $version];
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-eligibility-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCE{$number}",
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'unit' => 'Surat',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    private function grant(User $user, array $codes): void
    {
        foreach ($codes as $code) {
            $parts = explode('.', $code);
            $action = array_pop($parts);
            $permission = Permission::query()->firstOrCreate(['code' => $code], [
                'name' => $code,
                'resource' => implode('.', $parts),
                'action' => $action,
                'level' => 'ACTION',
                'is_sensitive' => str_contains($code, 'decide'),
                'is_active' => true,
            ]);
            DB::table('user_permissions')->updateOrInsert(
                ['user_id' => $user->id, 'permission_id' => $permission->id],
                ['is_denied' => false],
            );
        }
    }

    private function actingAsUser(User $user): static
    {
        return $this->withToken(auth('api')->login($user));
    }
}
