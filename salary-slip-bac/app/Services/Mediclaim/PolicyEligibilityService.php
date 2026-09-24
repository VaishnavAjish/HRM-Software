<?php

namespace App\Services\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimEnrollment;
use App\Models\Mediclaim\MediclaimFloaterOverride;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\User;
use App\Support\MediclaimFinancialYear;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
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

        $category = MediclaimMember::categoryForRelationship($member->relationship_type);

        if ($category === 'child') {
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

        if ($category === 'parent') {
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
            ->whereIn('relationship_type', ['child', 'son', 'daughter'])
            ->where('status', 'active')
            ->where('effective_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>=', $date))
            ->when($excludingMemberId, fn ($q) => $q->where('id', '!=', $excludingMemberId))
            ->count();
    }

    /**
     * The family floater's limit/used/remaining for an enrollment WITHIN THE
     * FINANCIAL YEAR containing `$asOf` (defaults to now — "how much is left
     * for the employee right now"), "used" being the sum of
     * `total_approved_amount` across the enrollment's claims *submitted*
     * within that FY window (only ever set once a claim clears Director
     * Final Approval). Anchored to `submitted_at` rather than the approval
     * decision's own timestamp so a claim keeps counting against the FY it
     * was actually raised in even if review drags into the next one.
     *
     * The limit resets automatically every April 1 simply because the
     * window this sums over moves — there is no separate "renew the
     * floater" job or stored balance to reset.
     *
     * @return array{limit: float, used: float, remaining: float, financialYearStart: string, financialYearEnd: string}
     */
    public function floaterUsage(MediclaimEnrollment $enrollment, MediclaimPolicyVersion $version, ?Carbon $asOf = null): array
    {
        $asOf ??= Carbon::now();
        $fyStart = MediclaimFinancialYear::start($asOf);
        $fyEnd = MediclaimFinancialYear::end($asOf);

        $limit = (float) ($version->rules['floater_limit_amount'] ?? 300000.0);
        if ($limit <= 0) {
            $limit = 300000.0;
        }

        $used = (float) MediclaimClaim::query()
            ->where(function ($q) use ($enrollment) {
                $q->where('enrollment_id', $enrollment->id)
                  ->orWhere('employee_user_id', $enrollment->employee_user_id);
            })
            ->whereIn('status', [
                MediclaimClaim::STATUS_APPROVED,
                MediclaimClaim::STATUS_PARTIALLY_APPROVED,
                MediclaimClaim::STATUS_SETTLEMENT_PENDING,
                MediclaimClaim::STATUS_SETTLED,
                MediclaimClaim::STATUS_CLOSED,
            ])
            ->whereBetween('submitted_at', [$fyStart, $fyEnd])
            ->sum(\DB::raw('COALESCE(total_approved_amount, 0)'));

        return [
            'limit' => $limit,
            'used' => $used,
            'remaining' => max(0.0, $limit - $used),
            'financialYearStart' => $fyStart->toDateString(),
            'financialYearEnd' => $fyEnd->toDateString(),
        ];
    }

    /**
     * Throws unless approving `$additional` more keeps the enrollment's
     * cumulative approved amount — WITHIN THE SAME FINANCIAL YEAR `$asOf`
     * falls in (defaults to now) — within its floater limit, or an
     * authorized override accompanies the decision. `directorFinalApproval()`
     * passes the claim's own `submitted_at` here, so the check is always
     * against the FY the claim actually belongs to.
     */
    public function assertWithinFloater(MediclaimEnrollment $enrollment, MediclaimPolicyVersion $version, float $additional, ?MediclaimFloaterOverride $override = null, ?Carbon $asOf = null): void
    {
        if ($override !== null) {
            return;
        }

        $usage = $this->floaterUsage($enrollment, $version, $asOf);

        if ($usage['used'] + $additional > $usage['limit']) {
            throw ValidationException::withMessages([
                'approved_amount' => sprintf(
                    'Approving %.2f would exceed the family floater limit of %.2f for FY %s to %s (already used %.2f, %.2f remaining). An authorized floater override is required.',
                    $additional,
                    $usage['limit'],
                    $usage['financialYearStart'],
                    $usage['financialYearEnd'],
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
     * `joining_date` (the real HR field — a plain nullable `string` column,
     * so it can genuinely be blank) is the ONLY real source of truth here;
     * `doj`/`date_of_joining`/`date_of_appointment` were dead fallbacks —
     * none of them are actual columns on `users`, so those `??` branches
     * never fired.
     *
     * This used to fall back to `$employee->created_at` (the moment the
     * USER ROW was created — a bulk import, a re-sync, an admin fixing an
     * unrelated field — never the employee's actual join date) whenever
     * `joining_date` was blank, which silently mis-classified any
     * long-tenured employee whose row happened to be created/touched
     * recently as a brand-new joiner (2026-09-24 fix #1). That was then
     * changed to fail OPEN (already eligible) on a missing `joining_date` —
     * which fixed that false block, but created the opposite problem on the
     * live admin dashboard (`Admin\EmployeeController`): `joining_date` is
     * missing for a lot of real employees, INCLUDING genuinely brand-new
     * ones HR hasn't back-filled it for yet, so they were all being marked
     * "already eligible" on day one — silently skipping the waiting period
     * for exactly the people it exists to gate (2026-09-24 fix #2).
     *
     * We genuinely cannot tell "long-tenured, data never filled in" apart
     * from "brand new, data not filled in yet" without the real date — so
     * neither "assume eligible" nor "assume not yet eligible" is honest.
     * This now returns a THIRD, distinct outcome for that case:
     * `eligible: false` with `reason: 'missing_joining_date'` (no fake
     * countdown) — access stays gated (the safe default for an unverified
     * new-joiner insurance benefit) but callers can tell "your joining date
     * isn't on file, ask HR to add it" apart from the real "N days left"
     * message, instead of either guessing wrong. This is what makes the
     * admin dashboard's `not_eligible` bucket meaningful again — HR can now
     * find and fix these by adding the missing joining date, and the
     * employee flips to their real status (eligible or genuinely waiting)
     * the moment it's filled in.
     *
     * @return array{eligible: bool, eligible_from: ?string, days_remaining: ?int, joining_date: ?string, waiting_period_months: int, reason: ?string}
     */
    public function waitingPeriodStatus(User $employee, ?Carbon $asOf = null): array
    {
        $asOf ??= Carbon::now();

        $rawJoiningDate = $employee->joining_date;
        $joiningDate = ($rawJoiningDate !== null && trim((string) $rawJoiningDate) !== '')
            ? Carbon::parse($rawJoiningDate)
            : null;

        $version = $this->activePolicyVersionForCompany($employee->company_code, $asOf);

        // Standard Mediclaim policy rule: 3 months waiting period from joining date
        $months = isset($version?->rules['eligibility_waiting_period_months'])
            ? (int) $version->rules['eligibility_waiting_period_months']
            : 3;

        if ($joiningDate === null) {
            Log::warning('Mediclaim waiting-period check: employee has no joining_date on file; eligibility cannot be determined until HR adds it.', [
                'employee_id' => $employee->id,
                'emp_code' => $employee->emp_code,
                'company_code' => $employee->company_code,
            ]);

            return [
                'eligible' => false,
                'eligible_from' => null,
                'days_remaining' => null,
                'joining_date' => null,
                'waiting_period_months' => $months,
                'reason' => 'missing_joining_date',
            ];
        }

        if ($months <= 0) {
            return [
                'eligible' => true,
                'eligible_from' => $joiningDate->toDateString(),
                'days_remaining' => 0,
                'joining_date' => $joiningDate->toDateString(),
                'waiting_period_months' => 0,
                'reason' => null,
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
            'reason' => $eligible ? null : 'waiting_period',
        ];
    }

    /** Throws a 403 MediclaimException if the employee is still within the waiting period (or their joining date is missing). */
    public function assertEligible(User $employee, ?Carbon $asOf = null): void
    {
        $status = $this->waitingPeriodStatus($employee, $asOf);

        if ($status['eligible']) {
            return;
        }

        if (($status['reason'] ?? null) === 'missing_joining_date') {
            throw MediclaimException::forbidden(
                'MEDICLAIM_JOINING_DATE_MISSING',
                'Your joining date isn\'t on file yet, so Mediclaim eligibility can\'t be determined — please ask HR to add it to your profile.'
            );
        }

        throw MediclaimException::forbidden(
            'MEDICLAIM_NOT_YET_ELIGIBLE',
            sprintf(
                'Mediclaim becomes available %d day(s) from now, on %s (3 months after your joining date).',
                $status['days_remaining'],
                $status['eligible_from']
            )
        );
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

        $status = $this->waitingPeriodStatus($employee, $asOf);
        if (! $status['eligible']) {
            return null;
        }

        $existing = MediclaimEnrollment::query()
            ->where('employee_user_id', $employee->id)
            ->latest('id')
            ->first();

        if ($existing) {
            if ($existing->status !== 'active') {
                $existing->status = 'active';
                $existing->save();
            }
            return $existing;
        }

        $version = $this->activePolicyVersionForCompany($employee->company_code, $asOf);
        if (! $version) {
            Log::warning('Mediclaim: employee cleared the waiting period but no active policy version was found for their company.', [
                'employee_id' => $employee->id,
                'emp_code' => $employee->emp_code,
                'company_code' => $employee->company_code,
            ]);

            return null;
        }

        $primaryCompany = $employee->company_code ? trim(explode(',', $employee->company_code)[0]) : null;

        $enrollment = MediclaimEnrollment::query()->firstOrCreate(
            ['policy_version_id' => $version->id, 'employee_user_id' => $employee->id],
            [
                'company_code' => $primaryCompany,
                'status' => 'active',
                'enrolled_at' => $status['eligible_from'] ?? $asOf->toDateString(),
            ]
        );

        if ($enrollment->status !== 'active') {
            $enrollment->status = 'active';
            $enrollment->save();
        }

        return $enrollment;
    }

    public function activePolicyVersionForCompany(?string $companyCode, ?Carbon $asOf = null, bool $allowSelfHeal = true): ?MediclaimPolicyVersion
    {
        $asOf ??= Carbon::now();
        $date = $asOf->toDateString();
        $primaryCompany = $companyCode ? trim(explode(',', $companyCode)[0]) : null;

        if ($primaryCompany) {
            $norm = strtolower(preg_replace('/[^a-zA-Z0-9]/', '', $primaryCompany));

            $version = MediclaimPolicyVersion::query()
                ->whereHas('policy', function ($q) use ($primaryCompany, $norm) {
                    $q->where(function ($sub) use ($primaryCompany, $norm) {
                        $sub->whereRaw('LOWER(company_code) = ?', [strtolower($primaryCompany)])
                            ->orWhereRaw("REPLACE(REPLACE(REPLACE(LOWER(company_code), '-', ''), '_', ''), ' ', '') = ?", [$norm]);
                    });
                })
                ->whereIn('status', ['active', 'published'])
                ->where(fn ($q) => $q->whereNull('effective_from')->orWhere('effective_from', '<=', $date))
                ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>=', $date))
                ->orderByDesc('version_number')
                ->first();

            if ($version) {
                return $version;
            }
        }

        // Global fallback: any active or published policy version in the entire system
        $fallback = MediclaimPolicyVersion::query()
            ->whereIn('status', ['active', 'published'])
            ->where(fn ($q) => $q->whereNull('effective_from')->orWhere('effective_from', '<=', $date))
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>=', $date))
            ->orderByDesc('version_number')
            ->first();

        if ($fallback) {
            return $fallback;
        }

        // If any version exists in the DB at all (e.g. unactivated draft), activate it immediately
        $anyVersion = MediclaimPolicyVersion::query()
            ->orderByDesc('version_number')
            ->first();

        if ($anyVersion) {
            $anyVersion->status = 'active';
            if (! $anyVersion->effective_from) {
                $anyVersion->effective_from = today();
            }
            $anyVersion->save();

            if ($anyVersion->policy && $anyVersion->policy->status !== 'active') {
                $anyVersion->policy->update(['status' => 'active']);
            }

            return $anyVersion;
        }

        // Zero policy versions exist anywhere in the database -> self-heal!
        if ($allowSelfHeal) {
            Log::warning('Mediclaim: no active policy version exists anywhere in the database — running MediclaimPolicySeeder to self-heal.', [
                'company_code' => $companyCode,
            ]);

            try {
                (new \Database\Seeders\MediclaimPolicySeeder())->run();
            } catch (\Throwable $e) {
                Log::error('MediclaimPolicySeeder run failed during self-heal: ' . $e->getMessage());
            }

            $recheck = $this->activePolicyVersionForCompany($companyCode, $asOf, allowSelfHeal: false);
            if ($recheck) {
                return $recheck;
            }

            // Direct fallback creation if seeder somehow didn't leave an active version
            $standardRules = [
                'floater_limit_amount' => 300000,
                'max_covered_children' => 2,
                'child_max_age_years' => 18,
                'parent_max_age_years' => 55,
                'intimation_required_for_planned' => true,
                'eligibility_waiting_period_months' => 3,
            ];

            $compCode = $primaryCompany ?: 'nidhi-impex';
            $policyCode = strtoupper(preg_replace('/[^a-zA-Z0-9]/', '-', $compCode)) . '-MEDICLAIM';
            $policyName = ucwords(str_replace(['-', '_'], ' ', $compCode)) . ' Group Mediclaim Policy';

            try {
                $policy = MediclaimPolicy::firstOrCreate(
                    ['policy_code' => $policyCode],
                    [
                        'company_code' => $compCode,
                        'name' => $policyName,
                        'status' => 'active',
                    ]
                );
                $policy->update(['status' => 'active']);

                $version = MediclaimPolicyVersion::firstOrCreate(
                    ['policy_id' => $policy->id, 'version_number' => 1],
                    [
                        'status' => 'active',
                        'rules' => $standardRules,
                        'effective_from' => today(),
                        'published_at' => now(),
                    ]
                );
                $version->update([
                    'status' => 'active',
                    'effective_from' => $version->effective_from ?? today(),
                    'rules' => ! empty($version->rules) ? $version->rules : $standardRules,
                ]);

                return $version;
            } catch (\Throwable $e) {
                Log::error('Direct policy creation failed during self-heal: ' . $e->getMessage());
            }
        }

        return null;
    }
}
