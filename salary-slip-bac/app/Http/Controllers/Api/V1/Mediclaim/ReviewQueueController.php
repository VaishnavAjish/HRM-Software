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
        // Simplified workflow: a claim at SUBMITTED or MANAGER_REVIEW is
        // decided in one step by whoever holds `mediclaim.claim.approve` (a
        // fixed HR-admin role) via ClaimWorkflowService::approveDirect() —
        // see that method's docblock. The legacy managerDecision() method
        // (tied to the employee's actual assigned manager +
        // confidentiality-ack) is left fully intact and still directly
        // callable; it is simply no longer reachable through this dispatch
        // table, since the fixed approver replaces the manager stage
        // entirely going forward.
        MediclaimClaim::STATUS_SUBMITTED => 'approveDirect',
        MediclaimClaim::STATUS_MANAGER_REVIEW => 'approveDirect',
        MediclaimClaim::STATUS_COORDINATOR_VERIFICATION => 'coordinatorVerify',
        MediclaimClaim::STATUS_COMMITTEE_RECOMMENDATION => 'committeeRecommend',
        MediclaimClaim::STATUS_HR_ELIGIBILITY_VERIFICATION => 'hrVerifyEligibility',
        MediclaimClaim::STATUS_DIRECTOR_FINAL_APPROVAL => 'directorFinalApproval',
        // Not a "decision" in the same sense as the five above (an
        // amount/mode/reference, not a decision/remarks pair), but
        // SETTLEMENT_PENDING is resolved through this exact same
        // stage-dispatch mechanism so it surfaces in the same pending-review
        // queue instead of needing a parallel endpoint. See `decide()`'s
        // special-cased branch below, mirroring how `directorFinalApproval`
        // is already special-cased for its own different parameter shape.
        MediclaimClaim::STATUS_SETTLEMENT_PENDING => 'recordSettlement',
    ];

    public function __construct(private readonly ClaimWorkflowService $workflow)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $actor = auth('api')->user();

        // decidableBy() (not the narrower awaitingReviewBy()) so a claim
        // sitting at MANAGER_REVIEW shows up here too — the admin Pending
        // Reviews tab now renders a Manager panel for those rows (see
        // PendingReviewsTab.jsx's STAGE_PANEL), and without this the list
        // endpoint backing it would never actually return them, even though
        // the decide() action below always accepted them.
        $query = MediclaimClaim::query()
            ->decidableBy($actor)
            ->with(['employee:id,name,email,emp_code,designation,company_code,unit,branch', 'hospital']);

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
            'approvedAmount' => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'floater_override' => ['sometimes', 'nullable', 'array'],
            'floater_override.override_amount' => ['sometimes', 'nullable', 'numeric', 'min:0.01'],
            'floater_override.reason' => ['sometimes', 'nullable', 'string', 'max:1000'],
            // Settlement-only fields — `decision` is still sent (a fixed
            // sentinel, e.g. "final_approve") purely to satisfy the shared
            // `required` rule above; it carries no meaning for this branch.
            'amount' => ['required_if:decision,final_approve', 'nullable', 'numeric', 'min:0.01'],
            'mode' => ['required_if:decision,final_approve', 'nullable', 'string', 'max:40'],
            'reference' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);

        $approvedAmount = null;
        if (isset($data['approved_amount']) && $data['approved_amount'] !== null && $data['approved_amount'] !== '') {
            $approvedAmount = (float) $data['approved_amount'];
        } elseif (isset($data['approvedAmount']) && $data['approvedAmount'] !== null && $data['approvedAmount'] !== '') {
            $approvedAmount = (float) $data['approvedAmount'];
        } elseif ($request->filled('approved_amount')) {
            $approvedAmount = (float) $request->input('approved_amount');
        } elseif ($request->filled('approvedAmount')) {
            $approvedAmount = (float) $request->input('approvedAmount');
        }

        return $this->guarded(function () use ($method, $model, $actor, $data, $approvedAmount) {
            if ($method === 'directorFinalApproval') {
                $updated = $this->workflow->directorFinalApproval(
                    $model,
                    $actor,
                    (string) $data['decision'],
                    (float) ($approvedAmount ?? 0),
                    $data['remarks'] ?? null,
                    $this->buildOverride($data['floater_override'] ?? null, $model)
                );
            } elseif ($method === 'approveDirect') {
                $updated = $this->workflow->approveDirect(
                    $model,
                    $actor,
                    (string) $data['decision'],
                    (float) ($approvedAmount ?? 0),
                    $data['remarks'] ?? null,
                    $this->buildOverride($data['floater_override'] ?? null, $model)
                );
            } elseif ($method === 'recordSettlement') {
                $updated = $this->workflow->recordSettlement(
                    $model,
                    $actor,
                    (float) $data['amount'],
                    (string) $data['mode'],
                    $data['reference'] ?? null
                );

                // A single "Final Approve" action both records the
                // settlement AND closes the claim out, once that settlement
                // fully covers the approved amount (recordSettlement() only
                // flips to SETTLED at that point — a partial settlement
                // stays at SETTLEMENT_PENDING, still in the pending queue,
                // exactly as it should). This is what moves a finished claim
                // into the "finalized" bucket the admin Claims tab shows in
                // one click, rather than a separate close step no UI exposes.
                if ($updated->status === MediclaimClaim::STATUS_SETTLED) {
                    $updated = $this->workflow->closeClaim($updated, $actor);
                }
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
