<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimClaim;
use App\Services\Mediclaim\ClaimWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `POST /claims/{claim}/return` — a separate, narrower convenience endpoint
 * (distinct from `Mediclaim\ReviewQueueController@decide`) for sending a
 * claim back to the employee from WHICHEVER stage currently holds it,
 * including stages whose own `decide()` decision set has no "return" option
 * (e.g. committee: `recommended|not_recommended` only — see
 * `ClaimWorkflowService::committeeRecommend()`'s docblock). The stage is
 * always inferred from `$claim->status` server-side, never accepted from the
 * client — `ClaimWorkflowService::returnForCorrection()` re-validates it
 * matches under its own row lock regardless.
 *
 * Gated the same way `decide()` is: `MediclaimClaim::decidableBy($actor)`
 * scopes/conceals the resource (404, not 403, for a claim this actor does
 * not currently hold), because — like the four non-manager stage
 * methods — `returnForCorrection()` does not itself check the caller's
 * identity against any assignment.
 */
class ClaimReviewController extends Controller
{
    use RespondsWithEnvelope;

    public function __construct(private readonly ClaimWorkflowService $workflow)
    {
    }

    public function return(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::query()->decidableBy($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found or not currently held for your review.');
        }

        $data = $request->validate([
            'remarks' => ['required', 'string', 'min:5', 'max:4000'],
        ]);

        return $this->guarded(fn () => $this->ok(
            $this->workflow->returnForCorrection($model, $actor, $model->status, $data['remarks'])
        ));
    }
}
