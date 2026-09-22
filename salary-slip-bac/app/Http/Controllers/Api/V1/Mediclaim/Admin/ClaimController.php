<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimDocumentLink;
use App\Models\Mediclaim\MediclaimIntimation;
use App\Support\MediclaimActivityLogSupport;
use App\Support\MediclaimFinancialYear;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

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
            ->with(['employee:id,name,email,emp_code,designation,company_code,unit,branch', 'hospital', 'assignedManager:id,name,email']);

        $this->applyCompanyScope($query, $request);

        // A draft is excluded by default unless explicitly requested.
        if ($request->filled('status')) {
            $statuses = explode(',', (string) $request->query('status'));
            $query->whereIn('status', $statuses);
        } else {
            $query->where('status', '!=', MediclaimClaim::STATUS_DRAFT);
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

        $fy = $request->query('financial_year') ?? $request->query('year');
        if ($fy !== null && $fy !== '') {
            $startYear = (int) (is_numeric($fy) ? $fy : explode('-', (string) $fy)[0]);
            if ($startYear > 2000) {
                [$fyStart, $fyEnd] = MediclaimFinancialYear::boundsForStartYear($startYear);
                $query->where(function ($q) use ($fyStart, $fyEnd) {
                    $q->whereBetween('submitted_at', [$fyStart, $fyEnd])
                        ->orWhere(function ($sub) use ($fyStart, $fyEnd) {
                            $sub->whereNull('submitted_at')
                                ->whereBetween('created_at', [$fyStart, $fyEnd]);
                        });
                });
            }
        }

        if ($request->filled('payment_status')) {
            $query->where('payment_status', (string) $request->query('payment_status'));
        }

        // Accounts' month-end tracking: which claims were actually settled
        // (money-wise, not just workflow-wise) in a given calendar month.
        // Falls back to `updated_at` for the rare row with no `settled_at`
        // (e.g. a REJECTED/WITHDRAWN/CANCELLED claim, which never settles),
        // mirroring the `financial_year` fallback pattern just above.
        if ($request->filled('month')) {
            try {
                $start = Carbon::createFromFormat('Y-m', (string) $request->query('month'))->startOfMonth();
                $end = $start->copy()->endOfMonth();
                $query->where(function ($q) use ($start, $end) {
                    $q->whereBetween('settled_at', [$start, $end])
                        ->orWhere(function ($sub) use ($start, $end) {
                            $sub->whereNull('settled_at')
                                ->whereBetween('updated_at', [$start, $end]);
                        });
                });
            } catch (Throwable $e) {
                // Invalid "month" value — ignore the filter rather than 500.
            }
        }

        return $this->ok($query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    /**
     * `POST /claims/payment-status` — Accounts' bulk "mark payment done"
     * action on the admin "Claims" tab. Deliberately its own tiny endpoint rather
     * than routed through `ClaimWorkflowService`/`ReviewQueueController`:
     * `payment_status` is Accounts' own bookkeeping flag, not a workflow
     * transition `status` drives, so it has no stage-method to dispatch to
     * and no decision/remarks shape to validate.
     *
     * Only SETTLED/CLOSED claims are eligible — a REJECTED/WITHDRAWN/
     * CANCELLED claim never had money approved to pay out, and a claim still
     * short of SETTLED hasn't finished the approved-amount reconciliation
     * `recordSettlement()` performs, so there's nothing for Accounts to
     * reconcile against yet.
     *
     * Gated on `mediclaim.claim.read` (the route middleware) — the same
     * permission `GET /claims` above already requires, rather than minting a
     * new Accounts-specific permission: whoever can already open this Claims
     * screen is trusted to also confirm a settled claim was paid out.
     */
    public function markPaymentCompleted(Request $request): JsonResponse
    {
        $data = $request->validate([
            'claim_ids' => ['required', 'array', 'min:1'],
            'claim_ids.*' => ['integer'],
        ]);

        $query = MediclaimClaim::query()->whereIn('id', $data['claim_ids']);
        $this->applyCompanyScope($query, $request);
        $claims = $query->get();

        $foundIds = $claims->pluck('id')->all();
        $missingIds = array_values(array_diff($data['claim_ids'], $foundIds));
        if (! empty($missingIds)) {
            return $this->missing('Claim(s) not found: ' . implode(', ', $missingIds));
        }

        $ineligible = $claims->filter(fn (MediclaimClaim $c) => ! in_array($c->status, [MediclaimClaim::STATUS_SETTLED, MediclaimClaim::STATUS_CLOSED], true));
        if ($ineligible->isNotEmpty()) {
            return response()->json([
                'success' => false,
                'error' => [
                    'code' => 'CLAIM_NOT_ELIGIBLE_FOR_PAYMENT',
                    'message' => 'Only settled/closed claims can be marked as payment completed: '
                        . $ineligible->map(fn (MediclaimClaim $c) => $c->claim_number ?? $c->id)->implode(', '),
                ],
            ], 422);
        }

        $actor = auth('api')->user();
        $now = now();

        DB::transaction(function () use ($claims, $actor, $now) {
            foreach ($claims as $claim) {
                if ($claim->payment_status === MediclaimClaim::PAYMENT_STATUS_COMPLETED) {
                    continue;
                }

                $claim->payment_status = MediclaimClaim::PAYMENT_STATUS_COMPLETED;
                $claim->payment_completed_at = $now;
                $claim->payment_completed_by = $actor->id;
                $claim->save();

                MediclaimActivityLogSupport::log(
                    $actor,
                    'CLAIM_PAYMENT_MARKED_COMPLETED',
                    'mediclaim_claim',
                    $claim->id,
                    ['payment_status' => MediclaimClaim::PAYMENT_STATUS_PENDING],
                    ['payment_status' => MediclaimClaim::PAYMENT_STATUS_COMPLETED],
                    'Payment marked as completed.',
                    $claim->company_code
                );
            }
        });

        return $this->ok(['updated' => $claims->pluck('id')->values()->all()]);
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
