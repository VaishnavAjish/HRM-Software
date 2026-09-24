<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimHospital;
use App\Models\User;
use App\Services\Mediclaim\MediclaimMemberService;
use App\Services\Mediclaim\PolicyEligibilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * `GET /me/coverage` — the authenticated employee's own enrollment/floater
 * summary, plus `POST /me/rule-book-acknowledge` and
 * `POST /me/onboarding-complete`, the two steps of the gate
 * `EmployeeMediclaimWorkspace.jsx` walks a brand-new employee through
 * (read the rule book, then add family members) before unlocking the full
 * tabbed workspace. Both flags live on `MediclaimEnrollment` — see that
 * migration's backfill note for why existing enrollments start ungated.
 */
class MyCoverageController extends Controller
{
    use RespondsWithEnvelope;

    public function __construct(
        private readonly PolicyEligibilityService $eligibility,
        private readonly MediclaimMemberService $members,
    ) {
    }

    public function show(Request $request): JsonResponse
    {
        $actor = auth('api')->user();
        $eligibility = $this->eligibility->waitingPeriodStatus($actor);

        // Every eligible employee gets their own coverage + card
        // automatically — "My Coverage" is the module's default landing
        // tab, so simply opening it is enough to provision it, with no
        // "add a family member first" gate. No-ops once already issued.
        $this->members->ensureSelfCoverageIssued($actor);

        $enrollment = $this->eligibility->resolveOrCreateEnrollment($actor)
            ?->load(['policyVersion.policy', 'policyVersion.hospitals']);

        if (! $enrollment) {
            return $this->ok([
                'enrollment' => null, 'members' => [], 'floater' => null, 'hospitals' => [],
                'eligibility' => $eligibility, 'onboarding' => $this->onboardingState(null),
            ]);
        }

        $policyVersion = $enrollment->policyVersion;

        return $this->ok([
            'enrollment' => $enrollment,
            'members' => $policyVersion ? $this->eligibility->eligibleMembers($enrollment, now())->values() : [],
            'floater' => $policyVersion ? $this->eligibility->floaterUsage($enrollment, $policyVersion) : null,
            'hospitals' => ($policyVersion && $policyVersion->hospitals->isNotEmpty())
                ? $policyVersion->hospitals
                : $this->activeHospitals(),
            'eligibility' => $eligibility,
            'onboarding' => $this->onboardingState($enrollment),
        ]);
    }

    /**
     * Falls back to here whenever the employee's policy version has no
     * `mediclaim_policy_hospitals` rows curated yet (the seeder deliberately
     * leaves that pivot empty — see `MediclaimPolicySeeder`'s own docblock —
     * so this is the common case, not an edge case). Hospitals are a single
     * shared directory, not scoped per company (2026-09-22, at the user's
     * explicit direction — a hospital isn't "owned" by a company) — this is
     * the exact same unscoped list `HospitalController::index()` returns, so
     * "My Coverage" and the hospital directory never disagree.
     */
    private function activeHospitals()
    {
        return MediclaimHospital::query()
            ->where('status', 'active')
            ->with('contacts')
            ->orderBy('name')
            ->get();
    }

    public function acknowledgeRuleBook(Request $request): JsonResponse
    {
        $actor = auth('api')->user();
        $enrollment = $this->eligibility->resolveOrCreateEnrollment($actor);

        if (! $enrollment) {
            return $this->enrollmentMissingResponse($actor);
        }

        if (! $enrollment->rule_book_acknowledged_at) {
            $enrollment->rule_book_acknowledged_at = now();
            $enrollment->save();
        }

        return $this->ok(['onboarding' => $this->onboardingState($enrollment)]);
    }

    public function completeOnboarding(Request $request): JsonResponse
    {
        $actor = auth('api')->user();
        $enrollment = $this->eligibility->resolveOrCreateEnrollment($actor);

        if (! $enrollment) {
            return $this->enrollmentMissingResponse($actor);
        }

        if (! $enrollment->rule_book_acknowledged_at) {
            throw ValidationException::withMessages(['rule_book' => 'Read and acknowledge the rule book before continuing.']);
        }

        if (! $enrollment->onboarding_completed_at) {
            $enrollment->onboarding_completed_at = now();
            $enrollment->save();
        }

        return $this->ok(['onboarding' => $this->onboardingState($enrollment)]);
    }

    /**
     * `resolveOrCreateEnrollment()` returns null for exactly two reasons —
     * the employee hasn't cleared the waiting period yet, or their company
     * has no active `MediclaimPolicyVersion` to enroll them under — and the
     * two need very different responses. Collapsing both into one generic
     * "no enrollment was found" message (the previous behavior) made a
     * company-wide policy-setup gap look like a single employee's missing
     * data, which sent support hunting through the wrong system. Re-deriving
     * `waitingPeriodStatus()` here (cheap — no enrollment row involved) lets
     * us tell the two apart and point at the actual fix in each case.
     */
    private function enrollmentMissingResponse(User $actor): JsonResponse
    {
        $status = $this->eligibility->waitingPeriodStatus($actor);

        if (! $status['eligible']) {
            if (($status['reason'] ?? null) === 'missing_joining_date') {
                return $this->missing(
                    'Your joining date isn\'t on file yet, so Mediclaim eligibility can\'t be determined — please ask HR to add it to your profile.',
                    'MEDICLAIM_JOINING_DATE_MISSING'
                );
            }

            return $this->missing(
                sprintf(
                    'Mediclaim becomes available %d day(s) from now, on %s (3 months after your joining date).',
                    $status['days_remaining'],
                    $status['eligible_from']
                ),
                'MEDICLAIM_NOT_YET_ELIGIBLE'
            );
        }

        // Eligible by tenure, but no active policy version exists for this
        // employee's company (or at all) — a policy-setup gap, not a
        // per-employee one. Fixed by publishing/activating a policy version
        // for the company, not by anything scoped to this employee.
        return $this->missing(
            'Your company\'s Mediclaim policy hasn\'t been set up yet. Please contact HR/Admin to get it configured — this isn\'t something specific to your account.',
            'MEDICLAIM_POLICY_NOT_CONFIGURED'
        );
    }

    /** @param  \App\Models\Mediclaim\MediclaimEnrollment|null  $enrollment */
    private function onboardingState($enrollment): array
    {
        return [
            'ruleBookAcknowledged' => (bool) $enrollment?->rule_book_acknowledged_at,
            'completed' => (bool) $enrollment?->onboarding_completed_at,
        ];
    }
}
