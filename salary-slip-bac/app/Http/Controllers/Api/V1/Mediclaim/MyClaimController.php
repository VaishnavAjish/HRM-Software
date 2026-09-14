<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\ValidatesClaimPayload;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimClaim;
use App\Services\Mediclaim\ClaimWorkflowService;
use App\Services\Mediclaim\PolicyEligibilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** `GET,POST /me/claims` — the authenticated employee's own claims: list + create a new draft. */
class MyClaimController extends Controller
{
    use RespondsWithEnvelope;
    use ValidatesClaimPayload;

    public function __construct(
        private readonly ClaimWorkflowService $workflow,
        private readonly PolicyEligibilityService $eligibility,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $actor = auth('api')->user();

        $query = MediclaimClaim::query()
            ->where('employee_user_id', $actor->id)
            ->with(['member', 'hospital', 'policyVersion']);

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        return $this->ok($query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $actor = auth('api')->user();
        $data = $request->validate($this->claimRules());

        return $this->guarded(function () use ($actor, $data) {
            $this->eligibility->assertEligible($actor);

            return $this->ok($this->workflow->createDraft($actor, $data), 201);
        });
    }
}
