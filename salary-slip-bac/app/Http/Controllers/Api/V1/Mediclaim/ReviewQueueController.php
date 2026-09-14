<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimFloaterOverride;
use App\Services\Mediclaim\ClaimWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * `GET /reviews/pending`, `POST /reviews/{claim}/decision` — the shared,
 * stage-aware review endpoints (plan reconciliation #5). `decide()` infers
 * the claim's current pending stage from `$claim->status` SERVER-SIDE —
 * never a client-supplied stage — and dispatches to the matching
 * `ClaimWorkflowService` method.
 *
 * `MediclaimClaim::scopeDecidableBy()` is the actual authorization gate
 * (see its docblock): four of the five stage methods on `ClaimWorkflowService`
 * do not themselves check the caller's identity, so skipping this scope
 * would let anyone holding the right *permission code* decide a claim held
 * by a different reviewer.
 */
class ReviewQueueController extends Controller
{
    use RespondsWithEnvelope;

    /** status (= MediclaimClaimAssignment::STAGE_*) => ClaimWorkflowService method name. */
    private const STAGE_METHODS = [
        MediclaimClaim::STATUS_MANAGER_REVIEW => 'managerDecision',
        MediclaimClaim::STATUS_COORDINATOR_VERIFICATION => 'coordinatorVerify',
        MediclaimClaim::STATUS_COMMITTEE_RECOMMENDATION => 'committeeRecommend',
        MediclaimClaim::STATUS_HR_ELIGIBILITY_VERIFICATION => 'hrVerifyEligibility',
        MediclaimClaim::STATUS_DIRECTOR_FINAL_APPROVAL => 'directorFinalApproval',
    ];

    public function __construct(private readonly ClaimWorkflowService $workflow)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $actor = auth('api')->user();

        $query = MediclaimClaim::query()
            ->awaitingReviewBy($actor)
            ->with(['employee:id,name,email,emp_code,designation', 'hospital']);

        return $this->ok($query->orderBy('submitted_at')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    public function decide(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::query()->decidableBy($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found or not currently awaiting your review.');
        }

        $method = self::STAGE_METHODS[$model->status] ?? null;

        if ($method === null) {
            throw ValidationException::withMessages(['status' => 'This claim is not currently awaiting a review decision.']);
        }

        $data = $request->validate([
            'decision' => ['required', 'string', 'max:40'],
            'remarks' => ['sometimes', 'nullable', 'string', 'max:4000'],
            'approved_amount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'floater_override' => ['sometimes', 'nullable', 'array'],
            'floater_override.override_amount' => ['sometimes', 'nullable', 'numeric', 'min:0.01'],
            'floater_override.reason' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ]);

        return $this->guarded(function () use ($method, $model, $actor, $data) {
            if ($method === 'directorFinalApproval') {
                $updated = $this->workflow->directorFinalApproval(
                    $model,
                    $actor,
                    (string) $data['decision'],
                    (float) ($data['approved_amount'] ?? 0),
                    $data['remarks'] ?? null,
                    $this->buildOverride($data['floater_override'] ?? null, $model)
                );
            } else {
                $updated = $this->workflow->{$method}($model, $actor, (string) $data['decision'], $data['remarks'] ?? null);
            }

            return $this->ok($updated);
        });
    }

    /**
     * Not a separately specified B4 endpoint — `directorFinalApproval()`'s
     * signature already accepts an optional `MediclaimFloaterOverride`, and
     * the plan lists no dedicated floater-override endpoint, so it is
     * accepted inline on the director's decision payload rather than left
     * unreachable. `assertWithinFloater()` still enforces the cap whenever
     * this is omitted.
     */
    private function buildOverride(?array $payload, MediclaimClaim $claim): ?MediclaimFloaterOverride
    {
        if (! $payload || empty($payload['override_amount'])) {
            return null;
        }

        $reason = trim((string) ($payload['reason'] ?? ''));

        if (mb_strlen($reason) < 5) {
            throw ValidationException::withMessages([
                'floater_override.reason' => 'A substantive reason of at least 5 characters is required for a floater override.',
            ]);
        }

        return new MediclaimFloaterOverride([
            'enrollment_id' => $claim->enrollment_id,
            'override_amount' => (float) $payload['override_amount'],
            'reason' => $reason,
        ]);
    }
}
