<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimDocumentLink;
use App\Models\Mediclaim\MediclaimIntimation;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * `GET /claims` — admin/company-scoped claim list. This is reconciliation
 * #3's addition: neither the backend nor frontend design pass originally
 * enumerated a bare admin list endpoint, but the admin "Claims" tab needs
 * one and it is the natural index counterpart to `GET /claims/{claim}`.
 *
 * `use ScopesCompany` + `applyCompanyScope()` mirrors
 * `JobRequisitionController`'s exact pattern.
 *
 * KNOWN EDGE CASE (flagged, not fixed here — see the B4 handoff report):
 * `ScopesCompany::applyCompanyScope()` unconditionally applies
 * `->where('unit', $userAuth->unit)` for a role=2 (unit-manager) actor.
 * `mediclaim_claims` has no `unit` column (unlike `job_requisitions`, which
 * is this trait's original table), so a role=2 actor hitting this endpoint
 * would 500 on "column unit does not exist" — a pre-existing trait
 * assumption, not something introduced here, but one worth guarding
 * (`Schema::hasColumn`) or avoiding (a company-only scope call) before any
 * role=2 user is ever granted `mediclaim.claim.read` in production.
 */
class ClaimController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = MediclaimClaim::query()
            ->with(['employee:id,name,email,emp_code,designation', 'hospital', 'assignedManager:id,name,email']);

        $this->applyCompanyScope($query, $request);

        // A draft is the employee's own private, unsubmitted work-in-progress
        // — never admin's business to see, and definitely never something
        // that belongs in a company-wide claims list. Excluded unconditionally
        // (not just when no status filter is given) since there is no
        // legitimate reason for this endpoint to ever surface one.
        $query->where('status', '!=', MediclaimClaim::STATUS_DRAFT);

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        if ($request->filled('search')) {
            $search = (string) $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->where('claim_number', 'like', "%{$search}%")
                    ->orWhereHas('employee', function ($e) use ($search) {
                        $e->where('name', 'like', "%{$search}%")->orWhere('emp_code', 'like', "%{$search}%");
                    });
            });
        }

        return $this->ok($query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    /**
     * `DELETE /claims/{claim}` — a genuine hard delete, unlike every other
     * "retire"/status-flip pattern elsewhere in this module (hospitals,
     * document requirements): those exist because a *historical* claim keeps
     * referencing them, but a claim itself has nothing downstream that
     * should ever need to resolve a deleted one. Gated on `mediclaim.claim.delete`
     * — a permission only a super admin realistically holds unless a
     * company explicitly grants it, per `RequirePermission`'s super-admin
     * bypass — for cleaning up test/duplicate/erroneous claim rows.
     *
     * Every direct child table (expenses, events, decisions, assignments,
     * settlements, revisions, floater overrides) cascade-deletes at the DB
     * level (`cascadeOnDelete()` in their migrations). The polymorphic
     * `mediclaim_document_links` rows and any intimation's `linked_claim_id`
     * are NOT real foreign keys, so those are cleaned up explicitly here
     * first — left alone, they'd dangle, pointing at a claim id that no
     * longer exists.
     */
    public function destroy(Request $request, int $claim): JsonResponse
    {
        $query = MediclaimClaim::query()->where('id', $claim);
        $this->applyCompanyScope($query, $request);
        $model = $query->first();

        if (! $model) {
            return $this->missing('Claim not found.');
        }

        $actor = auth('api')->user();
        $claimNumber = $model->claim_number;
        $companyCode = $model->company_code;

        DB::transaction(function () use ($model) {
            MediclaimDocumentLink::query()
                ->where('linkable_type', MediclaimClaim::class)
                ->where('linkable_id', $model->id)
                ->delete();

            MediclaimIntimation::query()
                ->where('linked_claim_id', $model->id)
                ->update(['linked_claim_id' => null]);

            $model->delete();
        });

        MediclaimActivityLogSupport::log($actor, 'CLAIM_DELETED', 'mediclaim_claim', $claim, ['claim_number' => $claimNumber], null, 'Claim permanently deleted.', $companyCode);

        return $this->ok(['deleted' => true]);
    }
}
