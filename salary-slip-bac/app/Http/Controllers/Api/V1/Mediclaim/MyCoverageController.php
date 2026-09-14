<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Services\Mediclaim\PolicyEligibilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** `GET /me/coverage` — the authenticated employee's own enrollment/floater summary. */
class MyCoverageController extends Controller
{
    use RespondsWithEnvelope;

    public function __construct(private readonly PolicyEligibilityService $eligibility)
    {
    }

    public function show(Request $request): JsonResponse
    {
        $actor = auth('api')->user();
        $eligibility = $this->eligibility->waitingPeriodStatus($actor);

        $enrollment = $this->eligibility->resolveOrCreateEnrollment($actor)
            ?->load(['policyVersion.policy', 'policyVersion.hospitals']);

        if (! $enrollment) {
            return $this->ok(['enrollment' => null, 'members' => [], 'floater' => null, 'hospitals' => [], 'eligibility' => $eligibility]);
        }

        $policyVersion = $enrollment->policyVersion;

        return $this->ok([
            'enrollment' => $enrollment,
            'members' => $policyVersion ? $this->eligibility->eligibleMembers($enrollment, now())->values() : [],
            'floater' => $policyVersion ? $this->eligibility->floaterUsage($enrollment, $policyVersion) : null,
            'hospitals' => $policyVersion ? $policyVersion->hospitals : [],
            'eligibility' => $eligibility,
        ]);
    }
}
