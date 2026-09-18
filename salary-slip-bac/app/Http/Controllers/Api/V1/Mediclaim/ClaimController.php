<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\ValidatesClaimPayload;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimClaim;
use App\Services\Mediclaim\ClaimWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `GET,PUT /claims/{claim}`, `POST /claims/{claim}/submit`,
 * `POST /claims/{claim}/withdraw`, `GET /claims/{claim}/timeline`,
 * `GET /claims/{claim}/decisions` — shared between the employee (own claim),
 * their manager, and any current-stage reviewer, per the resource-scoping
 * table in routes/mediclaim.php.
 *
 * Every lookup goes through `MediclaimClaim::visibleTo($actor)` first —
 * 404-concealment, never a manual `if (!authorized) abort(403)` — so a wrong
 * or inaccessible id is indistinguishable from one that never existed.
 */
class ClaimController extends Controller
{
    use RespondsWithEnvelope;
    use ValidatesClaimPayload;

    private const DETAIL_WITH = [
        'employee:id,name,email,emp_code,designation,company_code',
        'member', 'enrollment', 'policyVersion', 'hospital',
        'assignedManager:id,name,email,designation',
        'intimation', 'expenses',
        'assignments.assignee:id,name,email',
        'decisions.decidedBy:id,name,email',
        'settlements',
    ];

    public function __construct(private readonly ClaimWorkflowService $workflow)
    {
    }

    public function show(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::visibleTo($actor)->with(self::DETAIL_WITH)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        return $this->ok($model);
    }

    public function update(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::visibleTo($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        $data = $request->validate($this->claimRules());

        return $this->guarded(fn () => $this->ok($this->workflow->updateDraft($model, $actor, $data)));
    }

    public function submit(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::visibleTo($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        $idempotencyKey = $request->header('Idempotency-Key') ?: $request->input('idempotencyKey');

        return $this->guarded(fn () => $this->ok($this->workflow->submit($model, $actor, $idempotencyKey)));
    }

    public function withdraw(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::visibleTo($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        return $this->guarded(fn () => $this->ok($this->workflow->withdraw($model, $actor)));
    }

    /**
     * `POST /claims/{claim}/discharge` — the employee records the actual
     * discharge date once treatment that was still ongoing at submission
     * time has finished. See `ClaimWorkflowService::recordDischarge()`'s
     * docblock for why this can't just be another `update()` call.
     */
    public function discharge(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::visibleTo($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        $data = $request->validate(['discharge_at' => ['required', 'date']]);

        return $this->guarded(fn () => $this->ok(
            $this->workflow->recordDischarge($model, $actor, \Illuminate\Support\Carbon::parse($data['discharge_at']))
        ));
    }

    /**
     * `POST /claims/{claim}/finalize-treatment` — the simplified workflow's
     * ongoing-treatment follow-up: the employee records the real discharge
     * date AND the final expense line items together, once the actual bill
     * is known. See `ClaimWorkflowService::finalizeTreatment()`'s docblock
     * for the amount-reconciliation rules this triggers.
     */
    public function finalizeTreatment(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::visibleTo($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        $data = $request->validate([
            'discharge_at' => ['required', 'date'],
            'expenses' => ['required', 'array', 'min:1'],
            'expenses.*.category' => ['required', 'string', 'max:60'],
            'expenses.*.description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'expenses.*.claimed_amount' => ['required', 'numeric', 'min:0.01'],
            'expenses.*.expense_date' => ['sometimes', 'nullable', 'date'],
        ]);

        return $this->guarded(fn () => $this->ok($this->workflow->finalizeTreatment(
            $model,
            $actor,
            \Illuminate\Support\Carbon::parse($data['discharge_at']),
            $data['expenses']
        )));
    }

    public function timeline(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::visibleTo($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        return $this->ok($model->events()->with('actor:id,name,email')->orderBy('id')->get());
    }

    public function decisions(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::visibleTo($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        return $this->ok($model->decisions()->with('decidedBy:id,name,email')->orderBy('id')->get());
    }

    /**
     * `POST /claims/{claim}/confidentiality-ack` — NOT in the plan's literal
     * B4 endpoint table, but added here as a necessary completion of it:
     * `ClaimWorkflowService::acknowledgeConfidentiality()` (added in B3)
     * exists specifically because `managerDecision()` refuses any decision
     * (409 CONFIDENTIALITY_ACK_REQUIRED) until this is recorded, and B3's own
     * docblock flags that "a future B4 controller endpoint... will need to
     * call it." Without this route the manager-review stage would be
     * permanently unreachable — every claim would dead-end at
     * MANAGER_REVIEW. Gated on the same `mediclaim.claim.manager.decide`
     * permission a manager needs to decide at all.
     */
    public function confidentialityAck(Request $request, int $claim): JsonResponse
    {
        $actor = auth('api')->user();
        $model = MediclaimClaim::visibleTo($actor)->find($claim);

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        return $this->guarded(fn () => $this->ok($this->workflow->acknowledgeConfidentiality($model, $actor)));
    }
}
