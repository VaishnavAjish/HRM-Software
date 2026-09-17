<?php

namespace App\Http\Controllers\Api\V1\Mediclaim;

use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\ValidatesClaimPayload;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimDocumentRequirement;
use App\Services\Mediclaim\ClaimWorkflowService;
use App\Services\Mediclaim\PolicyEligibilityService;
use App\Support\MediclaimFinancialYear;
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

        // `search` — claim number or patient name, mirroring
        // `Admin\ClaimController::index()`'s equivalent (claim number /
        // employee name) so the "My Claims" search box has the same
        // reach an admin's does, scoped to the employee's own claims.
        // `patient_snapshot->name` uses Eloquent's portable JSON-path
        // `where()` syntax rather than a driver-specific JSON operator.
        if ($request->filled('search')) {
            $search = (string) $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->where('claim_number', 'like', "%{$search}%")
                    ->orWhere('patient_snapshot->name', 'like', "%{$search}%");
            });
        }

        // `financial_year` — the FY's starting calendar year (e.g. `2026`
        // for FY 2026-27) — powers "My Claims"' FY filter. Scoped to
        // `submitted_at` (a draft never submitted has none and is excluded
        // by any FY filter, same as it's excluded from floater usage) so a
        // claim always lands in the same financial year here as it does
        // against the floater in PolicyEligibilityService::floaterUsage().
        if ($request->filled('financial_year')) {
            [$fyStart, $fyEnd] = MediclaimFinancialYear::boundsForStartYear((int) $request->query('financial_year'));
            $query->whereBetween('submitted_at', [$fyStart, $fyEnd]);
        }

        $paginated = $query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100));

        // `missing_document_types` — computed per row (bounded by per_page,
        // so this stays cheap) so the "My Claims" list can prompt the
        // employee to upload as soon as a claim clears review and is
        // awaiting settlement, without a separate per-claim round trip.
        // `documents_due_at` gates this the same way it gates the reminder
        // sweep and the drawer's own banner — before discharge is recorded
        // there is no real due date yet, so nothing should read as "missing".
        $paginated->getCollection()->transform(function (MediclaimClaim $claim) {
            $claim->missing_document_types = $claim->documents_due_at
                ? MediclaimDocumentRequirement::missingTypesFor($claim)
                : [];

            return $claim;
        });

        return $this->ok($paginated);
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
