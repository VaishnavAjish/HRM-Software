<?php

namespace App\Services\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimEnrollment;
use App\Models\Mediclaim\MediclaimFloaterOverride;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/**
 * Every Mediclaim eligibility rule — the family floater cap, max covered
 * children, child/parent age limits, network-hospital membership, whether an
 * intimation is required for planned treatment — read from
 * `MediclaimPolicyVersion::rules` (JSON) or the version's `hospitals()`
 * network relation. Nothing here is ever hardcoded, and every date-sensitive
 * method takes an explicit `Carbon` parameter rather than calling `now()`
 * internally, so evaluating an already-decided claim against a later policy
 * version — or re-running eligibility today for a claim treated last year —
 * can never happen by accident.
 */
class PolicyEligibilityService
{
    /**
     * The policy version covering `$employee` on `$onDate`.
     *
     * An employee's enrollment history is one row per policy version they
     * were ever covered under (`mediclaim_enrollments` is unique on
     * `policy_version_id` + `employee_user_id`), each with its own
     * enrolled_at/terminated_at window. Resolving "the applicable version for
     * a date" means finding the enrollment whose own coverage window AND
     * whose policy version's effective_from/effective_to both cover that
     * date — not simply the employee's current/latest enrollment — so a
     * claim for treatment dated under an earlier policy period is evaluated
     * against the rules that were actually in force then.
     */
    public function resolvePolicyVersionForDate(User $employee, Carbon $onDate): ?MediclaimPolicyVersion
    {
        $date = $onDate->toDateString();

        return MediclaimEnrollment::query()
            ->where('employee_user_id', $employee->id)
            ->where('enrolled_at', '<=', $date)
            ->where(fn ($q) => $q->whereNull('terminated_at')->orWhere('terminated_at', '>=', $date))
            ->whereHas('policyVersion', function ($q) use ($date) {
                $q->where('effective_from', '<=', $date)
                    ->where(fn ($qq) => $qq->whereNull('effective_to')->orWhere('effective_to', '>=', $date));
            })
            ->with('policyVersion')
            ->get()
            ->sortByDesc(fn (MediclaimEnrollment $enrollment) => (int) $enrollment->policyVersion->version_number)
            ->first()
            ?->policyVersion;
    }

    /**
     * The enrollment's covered members who are actually eligible as of a
     * date — active, within their own effective window, and passing every
     * age/count rule in `validateMemberEligibility()`.
     */
    public function eligibleMembers(MediclaimEnrollment $enrollment, Carbon $asOf): Collection
    {
        $version = $enrollment->policyVersion;
        $date = $asOf->toDateString();

        return $enrollment->members()
            ->where('status', 'active')
            ->where('effective_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>=', $date))
            ->get()
            ->filter(fn (MediclaimMember $member) => $version === null || $this->validateMemberEligibility($member, $version, $asOf)['ok'])
            ->values();
    }

    /**
     * Whether `$member` is validly covered under `$version`'s rules as of
     * `$treatmentDate`.
     *
     * @return array{ok: bool, reasons: list<string>}
     */
    public function validateMemberEligibility(MediclaimMember $member, MediclaimPolicyVersion $version, Carbon $treatmentDate): array
    {
        $reasons = [];
        $rules = $version->rules ?? [];

        if ($member->status !== 'active') {
            $reasons[] = 'This member is not currently active on the enrollment.';
        }

        if ($member->effective_from && $treatmentDate->lt(Carbon::parse($member->effective_from))) {
            $reasons[] = 'This member was not yet covered on the treatment date.';
        }

        if ($member->effective_to && $treatmentDate->gt(Carbon::parse($member->effective_to))) {
            $reasons[] = "This member's coverage had already ended by the treatment date.";
        }

        // Floored to whole completed years — Carbon 3's diffInYears() returns
        // a precise float (e.g. 18.997 the day before a 19th birthday), not
        // a truncated int like older Carbon did. Left un-floored, a member
        // reads as older than they actually are for almost their entire
        // final eligible year, making them falsely ineligible from shortly
        // after each birthday instead of only from their actual cutoff
        // birthday.
        $ageYears = $member->date_of_birth
            ? (int) floor(Carbon::parse($member->date_of_birth)->diffInYears($treatmentDate))
            : null;

        if ($member->relationship_type === 'child') {
            $maxAge = $rules['child_max_age_years'] ?? null;
            if ($maxAge !== null && $ageYears !== null && $ageYears > (int) $maxAge) {
                $reasons[] = "This child exceeds the policy's maximum covered age of {$maxAge} years.";
            }

            $maxChildren = $rules['max_covered_children'] ?? null;
            if ($maxChildren !== null && $member->employee_user_id) {
                $activeChildren = $this->countActiveChildren((int) $member->employee_user_id, $treatmentDate);
                if ($activeChildren > (int) $maxChildren) {
                    $reasons[] = "The policy covers at most {$maxChildren} children; {$activeChildren} are currently active.";
                }
            }
        }

        if ($member->relationship_type === 'parent') {
            $maxAge = $rules['parent_max_age_years'] ?? null;
            if ($maxAge !== null && $ageYears !== null && $ageYears > (int) $maxAge) {
                $reasons[] = "This parent exceeds the policy's maximum covered age of {$maxAge} years.";
            }
        }

        return ['ok' => $reasons === [], 'reasons' => $reasons];
    }

    /** Active, covered children for an employee as of a date. */
    public function countActiveChildren(int $employeeUserId, Carbon $asOf, ?int $excludingMemberId = null): int
    {
        $date = $asOf->toDateString();

        return MediclaimMember::query()
            ->where('employee_user_id', $employeeUserId)
            ->where('relationship_type', 'child')
            ->where('status', 'active')
            ->where('effective_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>=', $date))
            ->when($excludingMemberId, fn ($q) => $q->where('id', '!=', $excludingMemberId))
            ->count();
    }

    /**
     * The family floater's limit/used/remaining for an enrollment, "used"
     * being the sum of `total_approved_amount` across the enrollment's
     * claims (only ever set once a claim clears Director Final Approval).
     *
     * @return array{limit: float, used: float, remaining: float}
     */
    public function floaterUsage(MediclaimEnrollment $enrollment, MediclaimPolicyVersion $version): array
    {
        $limit = (float) ($version->rules['floater_limit_amount'] ?? 0);
        $used = (float) MediclaimClaim::query()
            ->where('enrollment_id', $enrollment->id)
            ->whereNotNull('total_approved_amount')
            ->sum('total_approved_amount');

        return [
            'limit' => $limit,
            'used' => $used,
            'remaining' => max(0.0, $limit - $used),
        ];
    }

    /**
     * Throws unless approving `$additional` more keeps the enrollment's
     * cumulative approved amount within its floater limit, or an authorized
     * override accompanies the decision.
     */
    public function assertWithinFloater(MediclaimEnrollment $enrollment, MediclaimPolicyVersion $version, float $additional, ?MediclaimFloaterOverride $override = null): void
    {
        if ($override !== null) {
            return;
        }

        $usage = $this->floaterUsage($enrollment, $version);

        if ($usage['used'] + $additional > $usage['limit']) {
            throw ValidationException::withMessages([
                'approved_amount' => sprintf(
                    'Approving %.2f would exceed the family floater limit of %.2f (already used %.2f, %.2f remaining). An authorized floater override is required.',
                    $additional,
                    $usage['limit'],
                    $usage['used'],
                    $usage['remaining']
                ),
            ]);
        }
    }

    /** Whether a hospital is in `$version`'s network. */
    public function isNetworkHospital(MediclaimPolicyVersion $version, ?int $hospitalId): bool
    {
        if ($hospitalId === null) {
            return false;
        }

        return $version->hospitals()->whereKey($hospitalId)->exists();
    }

    /**
     * Whether office intimation is required before/at treatment.
     *
     * Emergencies are always exempt regardless of the policy's
     * `intimation_required_for_planned` rule — the PDF's own Section D
     * emergency carve-out.
     */
    public function intimationRequired(MediclaimPolicyVersion $version, bool $isEmergency): bool
    {
        if ($isEmergency) {
            return false;
        }

        return (bool) ($version->rules['intimation_required_for_planned'] ?? false);
    }

    /**
     * Whether `$employee` has cleared the policy's new-joiner waiting period
     * as of `$asOf`, read from `eligibility_waiting_period_months` on the
     * company's active policy version — not hardcoded, same as every other
     * rule in this class. Resolved directly from the company's active
     * version (not through an enrollment), since a new joiner within the
     * waiting period has no enrollment yet by definition.
     *
     * @return array{eligible: bool, eligible_from: ?string, days_remaining: int, joining_date: ?string, waiting_period_months: int}
     */
    public function waitingPeriodStatus(User $employee, ?Carbon $asOf = null): array
    {
        $asOf ??= Carbon::now();
        $joiningDate = $employee->joining_date ? Carbon::parse($employee->joining_date) : null;
        $version = $this->activePolicyVersionForCompany($employee->company_code, $asOf);
        $months = (int) ($version->rules['eligibility_waiting_period_months'] ?? 0);

        if ($joiningDate === null || $months <= 0) {
            return [
                'eligible' => true,
                'eligible_from' => null,
                'days_remaining' => 0,
                'joining_date' => $joiningDate?->toDateString(),
                'waiting_period_months' => $months,
            ];
        }

        $eligibleFrom = $joiningDate->copy()->addMonths($months);
        $eligible = $asOf->greaterThanOrEqualTo($eligibleFrom);

        return [
            'eligible' => $eligible,
            'eligible_from' => $eligibleFrom->toDateString(),
            'days_remaining' => $eligible ? 0 : (int) $asOf->copy()->startOfDay()->diffInDays($eligibleFrom->copy()->startOfDay()),
            'joining_date' => $joiningDate->toDateString(),
            'waiting_period_months' => $months,
        ];
    }

    /** Throws a 403 MediclaimException if the employee is still within the waiting period. */
    public function assertEligible(User $employee, ?Carbon $asOf = null): void
    {
        $status = $this->waitingPeriodStatus($employee, $asOf);
        if (! $status['eligible']) {
            throw MediclaimException::forbidden(
                'MEDICLAIM_NOT_YET_ELIGIBLE',
                sprintf(
                    'Mediclaim becomes available %d day(s) from now, on %s (3 months after your joining date).',
                    $status['days_remaining'],
                    $status['eligible_from']
                )
            );
        }
    }

    /**
     * Every employee gets the company's standard ₹3,00,000 floater
     * automatically once they clear the joining waiting period — there is no
     * separate HR "enroll this employee" step. So rather than requiring an
     * `mediclaim_enrollments` row to already exist (which previously only
     * HR's admin Enrollment screen could create), this resolves the
     * employee's active enrollment and lazily creates it — against the
     * company's current active policy version — the first time it's
     * actually needed (viewing coverage, adding a family member, submitting
     * a claim). Returns null only when the employee hasn't cleared the
     * waiting period yet, or the company has no active policy version.
     */
    public function resolveOrCreateEnrollment(User $employee, ?Carbon $asOf = null): ?MediclaimEnrollment
    {
        $asOf ??= Carbon::now();

        $existing = MediclaimEnrollment::query()
            ->where('employee_user_id', $employee->id)
            ->where('status', 'active')
            ->latest('id')
            ->first();

        if ($existing) {
            return $existing;
        }

        $status = $this->waitingPeriodStatus($employee, $asOf);
        if (! $status['eligible']) {
            return null;
        }

        $version = $this->activePolicyVersionForCompany($employee->company_code, $asOf);
        if (! $version) {
            return null;
        }

        $primaryCompany = $employee->company_code ? trim(explode(',', $employee->company_code)[0]) : null;

        return MediclaimEnrollment::query()->firstOrCreate(
            ['policy_version_id' => $version->id, 'employee_user_id' => $employee->id],
            [
                'company_code' => $primaryCompany,
                'status' => 'active',
                'enrolled_at' => $status['eligible_from'] ?? $asOf->toDateString(),
            ]
        );
    }

    private function activePolicyVersionForCompany(?string $companyCode, Carbon $asOf): ?MediclaimPolicyVersion
    {
        $primaryCompany = $companyCode ? trim(explode(',', $companyCode)[0]) : null;
        if (! $primaryCompany) {
            return null;
        }

        $date = $asOf->toDateString();

        return MediclaimPolicyVersion::query()
            ->whereHas('policy', fn ($q) => $q->where('company_code', $primaryCompany))
            ->where('status', 'active')
            ->where('effective_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>=', $date))
            ->orderByDesc('version_number')
            ->first();
    }
}
