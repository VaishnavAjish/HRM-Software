<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimSettlement;
use App\Services\Mediclaim\ClaimWorkflowService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * `GET,POST /settlements` — recording a (possibly phased) settlement payout
 * against a claim currently at SETTLEMENT_PENDING. `store()` goes through
 * `ClaimWorkflowService::recordSettlement()` rather than creating the row
 * directly, so the same locking/transition discipline (status re-check under
 * `lockForUpdate()`, auto-transition to SETTLED once cumulative settled
 * reaches the approved total) applies here as everywhere else in the
 * workflow.
 */
class SettlementController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    public function __construct(private readonly ClaimWorkflowService $workflow)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimSettlement::query()
            ->with(['claim:id,claim_number,company_code,status', 'recordedBy:id,name,email'])
            ->whereHas('claim', fn ($q) => $this->applyCompanyScope($q, $request));

        if ($request->filled('claim_id')) {
            $query->where('claim_id', (int) $request->query('claim_id'));
        }

        return $this->ok($query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'claim_id' => ['required', 'integer', 'exists:mediclaim_claims,id'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'mode' => ['required', 'string', 'max:60'],
            'reference' => ['sometimes', 'nullable', 'string', 'max:255'],
        ]);

        $query = MediclaimClaim::query()->where('id', $data['claim_id']);
        $this->applyCompanyScope($query, $request);
        $claim = $query->first();

        if (! $claim) {
            return $this->missing('Claim not found.');
        }

        $actor = auth('api')->user();

        return $this->guarded(fn () => $this->ok(
            $this->workflow->recordSettlement($claim, $actor, (float) $data['amount'], $data['mode'], $data['reference'] ?? null),
            201
        ));
    }
}
