<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
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
            'hospitals' => $policyVersion ? $policyVersion->hospitals : [],
            'eligibility' => $eligibility,
            'onboarding' => $this->onboardingState($enrollment),
        ]);
    }

    public function acknowledgeRuleBook(Request $request): JsonResponse
    {
        $actor = auth('api')->user();
        $enrollment = $this->eligibility->resolveOrCreateEnrollment($actor);

        if (! $enrollment) {
            return $this->missing('No active Mediclaim enrollment was found for this employee.');
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
            return $this->missing('No active Mediclaim enrollment was found for this employee.');
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

    /** @param  \App\Models\Mediclaim\MediclaimEnrollment|null  $enrollment */
    private function onboardingState($enrollment): array
    {
        return [
            'ruleBookAcknowledged' => (bool) $enrollment?->rule_book_acknowledged_at,
            'completed' => (bool) $enrollment?->onboarding_completed_at,
        ];
    }
}
