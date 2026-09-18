<?php

namespace App\Services\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimAssignment;
use App\Models\Mediclaim\MediclaimClaimDecision;
use App\Models\Mediclaim\MediclaimClaimRevision;
use App\Models\Mediclaim\MediclaimDocumentRequirement;
use App\Models\Mediclaim\MediclaimEnrollment;
use App\Models\Mediclaim\MediclaimFloaterOverride;
use App\Models\Mediclaim\MediclaimIntimation;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\Mediclaim\MediclaimSettlement;
use App\Models\User;
use App\Services\Tickets\ReportingHierarchy;
use App\Support\MediclaimClaimEventLog;
use App\Support\MediclaimClaimNumber;
use App\Support\MediclaimNotifier;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * The Mediclaim claim state machine.
 *
 * Clones `App\Services\Hr\JobRequisitionApprovalService`'s locking discipline
 * exactly: every public method wraps `DB::transaction()`, does
 * `MediclaimClaim::query()->lockForUpdate()->findOrFail()` at the top,
 * re-checks the claim's current `status` is in the legal source-state set for
 * that transition BEFORE mutating anything (an illegal/raced transition
 * throws `ValidationException` -> 422), and enforces a minimum-length
 * (5 trimmed characters, same floor `JobRequisitionApprovalService` uses)
 * remarks check wherever remarks are mandatory.
 *
 * Full status list (16 values, plain string column — see
 * `MediclaimClaim::STATUSES`):
 *   DRAFT -> SUBMITTED|MANAGER_REVIEW -> COORDINATOR_VERIFICATION
 *   -> COMMITTEE_RECOMMENDATION -> HR_ELIGIBILITY_VERIFICATION
 *   -> DIRECTOR_FINAL_APPROVAL -> SETTLEMENT_PENDING -> SETTLED -> CLOSED
 *   (side branches: RETURNED_FOR_CORRECTION, REJECTED, WITHDRAWN, CANCELLED;
 *   APPROVED/PARTIALLY_APPROVED exist as status values but are not used as a
 *   resting state by this service — see directorFinalApproval()'s docblock).
 *
 * A resubmission after RETURNED_FOR_CORRECTION always restarts full review at
 * MANAGER_REVIEW (never resumes from wherever it was returned), because
 * corrected medical/expense data invalidates any upstream sign-off already
 * recorded — see submit().
 */
class ClaimWorkflowService
{
    /** Statuses cancel() refuses to act on — the claim is already terminal. */
    private const TERMINAL_STATUSES = [
        MediclaimClaim::STATUS_APPROVED,
        MediclaimClaim::STATUS_PARTIALLY_APPROVED,
        MediclaimClaim::STATUS_REJECTED,
        MediclaimClaim::STATUS_SETTLED,
        MediclaimClaim::STATUS_CLOSED,
        MediclaimClaim::STATUS_WITHDRAWN,
        MediclaimClaim::STATUS_CANCELLED,
    ];

    /**
     * Statuses recordDischarge()/finalizeTreatment() refuse to act on —
     * deliberately NARROWER than TERMINAL_STATUSES above: it excludes
     * APPROVED/PARTIALLY_APPROVED. Under the simplified workflow (see
     * approveDirect()'s docblock) those two are a genuine mid-flow
     * "approved, awaiting documents" resting state, not a finished one — an
     * ongoing-treatment claim approved in principle before discharge MUST
     * still be able to reach finalizeTreatment() afterward. Reusing
     * TERMINAL_STATUSES here (as an earlier version of this method did) blocked
     * exactly that case with "Treatment can only be finalized on a
     * submitted, in-progress claim."
     */
    private const FINISHED_STATUSES = [
        MediclaimClaim::STATUS_REJECTED,
        MediclaimClaim::STATUS_SETTLED,
        MediclaimClaim::STATUS_CLOSED,
        MediclaimClaim::STATUS_WITHDRAWN,
        MediclaimClaim::STATUS_CANCELLED,
    ];

    /** Claim fields an employee may set directly on a draft. Everything
     *  workflow-controlled (status, claim_number, assigned_manager_id,
     *  enrollment/policy snapshot, totals, timestamps...) is deliberately
     *  excluded — those are only ever set by this service. */
    private const EDITABLE_FIELDS = [
        'member_id', 'hospital_id', 'intimation_id',
        'nature_of_illness', 'first_symptom_date', 'initial_symptoms', 'first_consultation_date',
        'treating_doctor_name', 'is_medico_legal_case', 'reported_to_police', 'police_station_details',
        'treatment_type', 'is_network_hospital', 'non_network_hospital_name', 'non_network_reason',
        'admission_at', 'discharge_at', 'is_ongoing_treatment', 'treatment_description',
        'declaration_accepted', 'declaration_version',
    ];

    public function __construct(
        private readonly PolicyEligibilityService $eligibility,
        private readonly ReportingHierarchy $reportingHierarchy,
    ) {
    }

    public function createDraft(User $employee, array $data): MediclaimClaim
    {
        return DB::transaction(function () use ($employee, $data) {
            $expenses = $data['expenses'] ?? null;

            $claim = new MediclaimClaim();
            $claim->fill($this->filterClaimData($data));
            $claim->employee_user_id = $employee->id;
            $claim->company_code = $data['company_code'] ?? $this->primaryCompanyCode($employee);
            $claim->status = MediclaimClaim::STATUS_DRAFT;
            $claim->current_revision = 1;
            $claim->total_claimed_amount = 0;
            $claim->employee_snapshot = $this->buildEmployeeSnapshot($employee);
            $claim->patient_snapshot = $this->buildPatientSnapshot($claim->member_id);
            $claim->created_by = $employee->id;
            $claim->updated_by = $employee->id;
            $claim->save();

            if (is_array($expenses)) {
                $this->syncExpenses($claim, $expenses);
            }

            $this->logTransition($claim, 'CLAIM_DRAFT_CREATED', null, MediclaimClaim::STATUS_DRAFT, $employee, 'Draft claim created.');

            return $this->freshClaim($claim);
        });
    }

    /** Legal only from DRAFT/RETURNED_FOR_CORRECTION. */
    public function updateDraft(MediclaimClaim $claim, User $actor, array $data): MediclaimClaim
    {
        return DB::transaction(function () use ($claim, $actor, $data) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if (! in_array($locked->status, [MediclaimClaim::STATUS_DRAFT, MediclaimClaim::STATUS_RETURNED_FOR_CORRECTION], true)) {
                throw ValidationException::withMessages(['status' => 'Only a draft or returned-for-correction claim can be edited.']);
            }

            if ((int) $locked->employee_user_id !== (int) $actor->id) {
                throw MediclaimException::forbidden('WRONG_CLAIM_OWNER', 'You may only edit your own claim.');
            }

            $expenses = $data['expenses'] ?? null;

            $locked->fill($this->filterClaimData($data));
            // Recomputed on every save (not just when `member_id` is part of
            // this particular payload) — cheap, and guards against the
            // snapshot ever going stale relative to whichever member is
            // currently selected. This is what `SubmitClaimTab.jsx`'s
            // `mapClaimToFormData()` reads back to restore the patient
            // picker's relationship/DOB/gender after a save — before this,
            // `patient_snapshot` was never populated at all, so resuming a
            // draft silently lost that data and re-failed Section B
            // validation even though a member was still selected.
            $locked->patient_snapshot = $this->buildPatientSnapshot($locked->member_id);
            $locked->employee_snapshot = $this->buildEmployeeSnapshot($actor);
            $locked->updated_by = $actor->id;
            $locked->save();

            if (is_array($expenses)) {
                $this->syncExpenses($locked, $expenses);
            }

            $this->logTransition($locked, 'CLAIM_DRAFT_UPDATED', $locked->status, $locked->status, $actor, 'Draft claim updated.');

            return $this->freshClaim($locked);
        });
    }

    /**
     * Legal only from DRAFT/RETURNED_FOR_CORRECTION.
     *
     * (a) recalculates `total_claimed_amount` server-side from
     *     `mediclaim_claim_expenses` — never trusts a client total;
     * (b) resolves the applicable policy version as-of `admission_at` (or the
     *     linked intimation's `expected_admission_date` when no admission
     *     date is recorded, or now() as a last resort for e.g. OPD claims
     *     with neither);
     * (c) snapshots `assigned_manager_id` via the existing upward
     *     ReportingHierarchy::managerFor();
     * (d) allocates `claim_number` only on first submission;
     * (e) on resubmission, snapshots the full prior state into a
     *     MediclaimClaimRevision row, bumps `current_revision`, and restarts
     *     the review chain at MANAGER_REVIEW;
     * (f) lands on MANAGER_REVIEW if a manager was resolved, else stays at
     *     SUBMITTED and an additional NO_MANAGER_ASSIGNED event is recorded;
     * (g) honors `$idempotencyKey`: a replay of the exact same submit request
     *     (same claim already carrying that key, already past DRAFT) is a
     *     no-op that returns the existing claim.
     */
    public function submit(MediclaimClaim $claim, User $employee, ?string $idempotencyKey = null): MediclaimClaim
    {
        return DB::transaction(function () use ($claim, $employee, $idempotencyKey) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if ((int) $locked->employee_user_id !== (int) $employee->id) {
                throw MediclaimException::forbidden('WRONG_CLAIM_OWNER', 'You may only submit your own claim.');
            }

            if ($idempotencyKey !== null
                && $locked->submission_idempotency_key === $idempotencyKey
                && $locked->status !== MediclaimClaim::STATUS_DRAFT) {
                return $this->freshClaim($locked);
            }

            if (! in_array($locked->status, [MediclaimClaim::STATUS_DRAFT, MediclaimClaim::STATUS_RETURNED_FOR_CORRECTION], true)) {
                throw ValidationException::withMessages(['status' => 'Only a draft or returned-for-correction claim can be submitted.']);
            }

            $fromStatus = $locked->status;
            $isResubmission = $fromStatus === MediclaimClaim::STATUS_RETURNED_FOR_CORRECTION;

            $priorState = null;
            if ($isResubmission) {
                $priorState = [
                    'claim' => $locked->toArray(),
                    'expenses' => $locked->expenses()->get()->toArray(),
                ];
            }

            // (a)
            $locked->total_claimed_amount = (float) $locked->expenses()->sum('claimed_amount');

            // Documents are uploaded separately, after discharge — the
            // employee has 7 days from discharge (or admission, or this
            // submission instant, for a claim with neither, e.g. OPD) before
            // `mediclaim:remind-missing-documents` starts nagging daily.
            $documentsAnchor = $locked->discharge_at ?? $locked->admission_at ?? now();
            $locked->documents_due_at = Carbon::parse($documentsAnchor)->addDays(7);

            // (b)
            $asOfDate = $locked->admission_at
                ? Carbon::parse($locked->admission_at)
                : ($locked->intimation?->expected_admission_date
                    ? Carbon::parse($locked->intimation->expected_admission_date)
                    : now());

            $this->eligibility->resolveOrCreateEnrollment($employee, $asOfDate);
            $policyVersion = $this->eligibility->resolvePolicyVersionForDate($employee, $asOfDate);
            $locked->policy_version_id = $policyVersion?->id;

            if ($policyVersion && ! $locked->enrollment_id) {
                $locked->enrollment_id = MediclaimEnrollment::query()
                    ->where('employee_user_id', $employee->id)
                    ->where('policy_version_id', $policyVersion->id)
                    ->value('id');
            }

            // (c)
            $manager = $this->reportingHierarchy->managerFor($employee, now());
            $locked->assigned_manager_id = $manager?->id;

            // (d)
            if ($locked->claim_number === null) {
                $locked->claim_number = MediclaimClaimNumber::next($locked->company_code);
            }

            if ($idempotencyKey !== null) {
                $locked->submission_idempotency_key = $idempotencyKey;
            }

            if ($locked->declaration_accepted && $locked->declaration_accepted_at === null) {
                $request = request();
                $locked->declaration_accepted_at = now();
                $locked->declaration_ip = $request?->ip();
                $locked->declaration_user_agent = $request?->userAgent();
            }

            $noManager = $manager === null;
            $locked->status = $noManager ? MediclaimClaim::STATUS_SUBMITTED : MediclaimClaim::STATUS_MANAGER_REVIEW;
            $locked->submitted_at = $locked->submitted_at ?? now();
            $locked->updated_by = $employee->id;
            $locked->save();

            // (e) Resubmission: snapshot, bump revision, and retire any
            // assignment left over from the earlier cycle — it no longer
            // reflects who should be deciding this corrected claim.
            if ($isResubmission) {
                MediclaimClaimRevision::create([
                    'claim_id' => $locked->id,
                    'revision_number' => $locked->current_revision,
                    'prior_state' => $priorState,
                    'reason' => 'Resubmitted after correction.',
                    'created_by' => $employee->id,
                ]);

                $locked->current_revision = ((int) $locked->current_revision) + 1;
                $locked->save();

                $locked->assignments()->where('status', 'ACTIVE')->update(['status' => 'SUPERSEDED']);
            }

            if (! $noManager) {
                MediclaimClaimAssignment::create([
                    'claim_id' => $locked->id,
                    'stage' => MediclaimClaimAssignment::STAGE_MANAGER_REVIEW,
                    'assigned_to' => $manager->id,
                    'status' => 'ACTIVE',
                    'assigned_by' => $employee->id,
                ]);
            }

            // Link the intimation this claim was raised against, if any.
            if ($locked->intimation_id) {
                MediclaimIntimation::query()
                    ->whereKey($locked->intimation_id)
                    ->whereNull('linked_claim_id')
                    ->update(['linked_claim_id' => $locked->id, 'status' => 'linked']);
            }

            $this->logTransition(
                $locked,
                $isResubmission ? 'CLAIM_RESUBMITTED' : 'CLAIM_SUBMITTED',
                $fromStatus,
                $locked->status,
                $employee,
                $noManager ? 'Submitted; no manager could be resolved.' : 'Claim submitted for manager review.'
            );

            if ($noManager) {
                MediclaimClaimEventLog::record($locked, 'NO_MANAGER_ASSIGNED', $locked->status, $locked->status, $employee, 'No active primary manager could be resolved for this employee.');
            }

            return $this->freshClaim($locked);
        });
    }

    /**
     * Records the actual discharge date/time once treatment that was still
     * ongoing at submission time has finished, and recomputes
     * `documents_due_at` from that real date.
     *
     * submit() can only anchor the 7-day document-upload window to whatever
     * was already known at submission time — `discharge_at` if the employee
     * had already been discharged, otherwise falling back to `admission_at`
     * (or the submission instant itself for an OPD claim with neither). For
     * a claim submitted while still hospitalized (`is_ongoing_treatment =
     * true`), that fallback anchor is not the real deadline — this is the
     * employee's way to correct it once discharge actually happens, without
     * reopening the whole claim for editing (which updateDraft() only
     * allows from DRAFT/RETURNED_FOR_CORRECTION anyway).
     *
     * Legal on any non-draft, non-finished status (see FINISHED_STATUSES —
     * deliberately NOT the broader TERMINAL_STATUSES, since APPROVED/
     * PARTIALLY_APPROVED are a genuine mid-flow "awaiting documents" resting
     * state under the simplified workflow, not a finished one) — discharge
     * can happen well after Manager Review (or later stages, or the new
     * single approval) has already started, and documents still need a real
     * deadline regardless of how far review has progressed.
     */
    public function recordDischarge(MediclaimClaim $claim, User $employee, Carbon $dischargeAt): MediclaimClaim
    {
        return DB::transaction(function () use ($claim, $employee, $dischargeAt) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if ((int) $locked->employee_user_id !== (int) $employee->id) {
                throw MediclaimException::forbidden('WRONG_CLAIM_OWNER', 'You may only update your own claim.');
            }

            $blocked = array_merge([MediclaimClaim::STATUS_DRAFT], self::FINISHED_STATUSES);
            if (in_array($locked->status, $blocked, true)) {
                throw ValidationException::withMessages(['status' => 'Discharge can only be recorded on a submitted, in-progress claim.']);
            }

            if ($dischargeAt->copy()->startOfDay()->gt(Carbon::now()->endOfDay())) {
                throw ValidationException::withMessages(['discharge_at' => 'Discharge date cannot be in the future.']);
            }

            if ($locked->admission_at && $dischargeAt->copy()->startOfDay()->lt(Carbon::parse($locked->admission_at)->startOfDay())) {
                throw ValidationException::withMessages(['discharge_at' => 'Discharge date cannot be before the admission date.']);
            }

            $locked->discharge_at = $dischargeAt;
            $locked->is_ongoing_treatment = false;
            $locked->documents_due_at = $dischargeAt->copy()->addDays(7);
            $locked->updated_by = $employee->id;
            $locked->save();

            $this->logTransition(
                $locked,
                'CLAIM_DISCHARGE_RECORDED',
                $locked->status,
                $locked->status,
                $employee,
                'Discharge recorded; document upload window now due ' . $locked->documents_due_at->toDateString() . '.'
            );

            return $this->freshClaim($locked);
        });
    }

    /**
     * Employee follow-up for a claim submitted while treatment was still
     * ongoing (`is_ongoing_treatment = true`): records the real discharge
     * date/time (same rules as recordDischarge() above — deliberately not
     * reused as a nested transaction, since the expense/reconciliation work
     * below must commit atomically with the discharge write, not as two
     * separate transactions) and APPENDS the final expense line items now
     * that the actual bill is known. syncExpenses() is a destructive
     * wholesale-replace and is only legal pre-submit (DRAFT/
     * RETURNED_FOR_CORRECTION), so it cannot be reused here.
     *
     * Reconciliation (only when the claim already rests at
     * APPROVED/PARTIALLY_APPROVED, i.e. approveDirect() already ran on
     * preliminary information while treatment was ongoing): if the original
     * approval decision was a full `approved` (not a capped
     * `partially_approved`), `total_approved_amount` is bumped to match the
     * freshly recomputed `total_claimed_amount` — the admin approved the
     * claim in principle, not a specific capped figure, so the final bill is
     * what gets auto-settled with no second review (see
     * `autoSettleIfDocumentsComplete()`). A `partially_approved` cap is a
     * deliberate reduced figure and is never silently raised by later
     * expense additions.
     *
     * Legal on the same statuses as recordDischarge() — see
     * FINISHED_STATUSES's docblock for why APPROVED/PARTIALLY_APPROVED must
     * stay legal here specifically (an ongoing-treatment claim approved in
     * principle before discharge must still be able to reach this method
     * afterward).
     */
    public function finalizeTreatment(MediclaimClaim $claim, User $employee, Carbon $dischargeAt, array $newExpenses): MediclaimClaim
    {
        return DB::transaction(function () use ($claim, $employee, $dischargeAt, $newExpenses) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if ((int) $locked->employee_user_id !== (int) $employee->id) {
                throw MediclaimException::forbidden('WRONG_CLAIM_OWNER', 'You may only update your own claim.');
            }

            $blocked = array_merge([MediclaimClaim::STATUS_DRAFT], self::FINISHED_STATUSES);
            if (in_array($locked->status, $blocked, true)) {
                throw ValidationException::withMessages(['status' => 'Treatment can only be finalized on a submitted, in-progress claim.']);
            }

            if ($dischargeAt->copy()->startOfDay()->gt(Carbon::now()->endOfDay())) {
                throw ValidationException::withMessages(['discharge_at' => 'Discharge date cannot be in the future.']);
            }

            if ($locked->admission_at && $dischargeAt->copy()->startOfDay()->lt(Carbon::parse($locked->admission_at)->startOfDay())) {
                throw ValidationException::withMessages(['discharge_at' => 'Discharge date cannot be before the admission date.']);
            }

            $locked->discharge_at = $dischargeAt;
            $locked->is_ongoing_treatment = false;
            $locked->documents_due_at = $dischargeAt->copy()->addDays(7);

            foreach ($newExpenses as $row) {
                $locked->expenses()->create([
                    'category' => $row['category'] ?? null,
                    'description' => $row['description'] ?? null,
                    'claimed_amount' => $row['claimed_amount'] ?? 0,
                    'expense_date' => $row['expense_date'] ?? null,
                ]);
            }

            $locked->total_claimed_amount = (float) $locked->expenses()->sum('claimed_amount');

            if (in_array($locked->status, [MediclaimClaim::STATUS_APPROVED, MediclaimClaim::STATUS_PARTIALLY_APPROVED], true)) {
                $latestApproval = $locked->decisions()
                    ->where('stage', 'APPROVAL')
                    ->latest('decided_at')
                    ->first();

                if ($latestApproval && $latestApproval->decision === 'approved') {
                    $locked->total_approved_amount = $locked->total_claimed_amount;
                    $locked->total_disallowed_amount = 0;
                    $locked->status = MediclaimClaim::STATUS_APPROVED;
                }
            }

            $locked->updated_by = $employee->id;
            $locked->save();

            $this->logTransition(
                $locked,
                'TREATMENT_FINALIZED',
                $locked->status,
                $locked->status,
                $employee,
                'Discharge and final charges recorded; document upload window now due ' . $locked->documents_due_at->toDateString() . '.'
            );

            return $this->freshClaim($locked);
        });
    }

    /**
     * Records the confidentiality acknowledgement a manager must give before
     * managerDecision() will accept a decision from them.
     *
     * Not one of the B3-specified ClaimWorkflowService methods, but without
     * it the CONFIDENTIALITY_ACK_REQUIRED gate below could never be
     * satisfied. Added here as the natural home for it (same locking
     * discipline, same assignment row); flagged in the handoff notes as an
     * addition a future B4 controller endpoint (e.g.
     * `POST /claims/{claim}/confidentiality-ack`) will need to call.
     */
    public function acknowledgeConfidentiality(MediclaimClaim $claim, User $manager): MediclaimClaimAssignment
    {
        return DB::transaction(function () use ($claim, $manager) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            // A super admin administering the module isn't necessarily
            // anyone's real manager — see managerDecision()'s matching
            // bypass, which this must stay consistent with (that method
            // refuses to proceed until an ack row exists at all, regardless
            // of who is calling).
            $actingAsSuperAdmin = $manager->isSuperAdmin();

            if (! $actingAsSuperAdmin && (int) $locked->assigned_manager_id !== (int) $manager->id) {
                throw MediclaimException::forbidden('WRONG_ASSIGNED_REVIEWER', 'This claim is not assigned to you.');
            }

            $assignment = $this->resolveOrCreateManagerAssignment($locked, $manager);

            if (! $actingAsSuperAdmin && (int) $assignment->assigned_to !== (int) $manager->id) {
                throw MediclaimException::forbidden('WRONG_ASSIGNED_REVIEWER', 'This claim is not assigned to you.');
            }

            $request = request();
            $assignment->confidentiality_ack_at = now();
            $assignment->confidentiality_ack_ip = $request?->ip();
            $assignment->confidentiality_ack_user_agent = $request?->userAgent();
            $assignment->save();

            MediclaimClaimEventLog::record($locked, 'CONFIDENTIALITY_ACKNOWLEDGED', $locked->status, $locked->status, $manager, 'Manager acknowledged the confidentiality notice.');

            return $assignment;
        });
    }

    /**
     * $decision ∈ approve|reject|return. Legal from MANAGER_REVIEW — and,
     * for a super admin only, also from SUBMITTED with no
     * `assigned_manager_id` (see `resolveOrCreateManagerAssignment()`'s
     * docblock for why that rescue path exists). Requires
     * `$claim->assigned_manager_id === $manager->id` (403
     * WRONG_ASSIGNED_REVIEWER otherwise) and a prior confidentiality
     * acknowledgement on the manager-stage assignment (409
     * CONFIDENTIALITY_ACK_REQUIRED otherwise) unless acting as super admin.
     * reject/return require remarks.
     */
    public function managerDecision(MediclaimClaim $claim, User $manager, string $decision, ?string $remarks = null): MediclaimClaim
    {
        if (! in_array($decision, ['approve', 'reject', 'return'], true)) {
            throw ValidationException::withMessages(['decision' => 'Unknown manager decision.']);
        }

        return DB::transaction(function () use ($claim, $manager, $decision, $remarks) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            // A super admin administering the module can decide any claim
            // regardless of who it was actually routed to (mirrors
            // MediclaimClaim::scopeAwaitingReviewBy()'s super-admin bypass,
            // which is what makes this claim reachable via GET
            // /reviews/pending in the first place), AND may rescue a claim
            // that never resolved a manager at all (status SUBMITTED, see
            // resolveOrCreateManagerAssignment()). A real manager still must
            // be the exact `assigned_manager_id` this claim was snapshotted
            // to, and the claim must actually be at MANAGER_REVIEW.
            $actingAsSuperAdmin = $manager->isSuperAdmin();
            $rescuingUnassigned = $actingAsSuperAdmin && $locked->status === MediclaimClaim::STATUS_SUBMITTED;

            if (! $rescuingUnassigned && $locked->status !== MediclaimClaim::STATUS_MANAGER_REVIEW) {
                throw ValidationException::withMessages(['status' => 'This claim is not awaiting manager review.']);
            }

            if (! $actingAsSuperAdmin && (int) $locked->assigned_manager_id !== (int) $manager->id) {
                throw MediclaimException::forbidden('WRONG_ASSIGNED_REVIEWER', 'This claim is not assigned to you for manager review.');
            }

            $assignment = $this->resolveOrCreateManagerAssignment($locked, $manager);

            if (! $actingAsSuperAdmin && (int) $assignment->assigned_to !== (int) $manager->id) {
                throw MediclaimException::forbidden('WRONG_ASSIGNED_REVIEWER', 'This claim is not assigned to you for manager review.');
            }

            if ($assignment->confidentiality_ack_at === null) {
                if (! $actingAsSuperAdmin) {
                    throw MediclaimException::conflict('CONFIDENTIALITY_ACK_REQUIRED', 'You must acknowledge the confidentiality notice before deciding this claim.');
                }

                // Super admin path: auto-record the ack rather than bouncing
                // through a 409 with no assigned-manager session that could
                // ever satisfy it. The real actor/IP/UA is still captured,
                // same as a normal acknowledgeConfidentiality() call.
                $request = request();
                $assignment->confidentiality_ack_at = now();
                $assignment->confidentiality_ack_ip = $request?->ip();
                $assignment->confidentiality_ack_user_agent = $request?->userAgent();
                $assignment->save();
            }

            if ($decision === 'return') {
                return $this->transitionToReturned($locked, $manager, MediclaimClaimAssignment::STAGE_MANAGER_REVIEW, (string) $remarks);
            }

            if ($decision === 'reject') {
                $remarks = $this->assertRemarks($remarks);
            }

            $fromStatus = $locked->status;
            $nextStatus = $decision === 'approve' ? MediclaimClaim::STATUS_COORDINATOR_VERIFICATION : MediclaimClaim::STATUS_REJECTED;

            $assignment->status = 'COMPLETED';
            $assignment->save();

            MediclaimClaimDecision::create([
                'claim_id' => $locked->id,
                'stage' => MediclaimClaimAssignment::STAGE_MANAGER_REVIEW,
                'decided_by' => $manager->id,
                'decision' => $decision === 'approve' ? 'approved' : 'rejected',
                'remarks' => $remarks,
                'decided_at' => now(),
            ]);

            $locked->status = $nextStatus;
            $locked->updated_by = $manager->id;
            $locked->save();

            $this->logTransition($locked, 'MANAGER_' . strtoupper($decision), $fromStatus, $nextStatus, $manager, $remarks);

            return $this->freshClaim($locked);
        });
    }

    /**
     * $decision ∈ verified|return. Legal only from COORDINATOR_VERIFICATION.
     * Records a MediclaimClaimDecision with
     * fields=['verified_claim_and_documents' => true] on verified. return
     * requires remarks.
     */
    public function coordinatorVerify(MediclaimClaim $claim, User $actor, string $decision, ?string $remarks = null): MediclaimClaim
    {
        if (! in_array($decision, ['verified', 'return'], true)) {
            throw ValidationException::withMessages(['decision' => 'Unknown coordinator decision.']);
        }

        return DB::transaction(function () use ($claim, $actor, $decision, $remarks) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if ($locked->status !== MediclaimClaim::STATUS_COORDINATOR_VERIFICATION) {
                throw ValidationException::withMessages(['status' => 'This claim is not awaiting coordinator verification.']);
            }

            if ($decision === 'return') {
                return $this->transitionToReturned($locked, $actor, MediclaimClaimAssignment::STAGE_COORDINATOR_VERIFICATION, (string) $remarks);
            }

            $this->recordStageAssignmentCompletion($locked, MediclaimClaimAssignment::STAGE_COORDINATOR_VERIFICATION, $actor);

            MediclaimClaimDecision::create([
                'claim_id' => $locked->id,
                'stage' => MediclaimClaimAssignment::STAGE_COORDINATOR_VERIFICATION,
                'decided_by' => $actor->id,
                'decision' => 'verified',
                'remarks' => $remarks,
                'fields' => ['verified_claim_and_documents' => true],
                'decided_at' => now(),
            ]);

            $fromStatus = $locked->status;
            $locked->status = MediclaimClaim::STATUS_COMMITTEE_RECOMMENDATION;
            $locked->updated_by = $actor->id;
            $locked->save();

            $this->logTransition($locked, 'COORDINATOR_VERIFIED', $fromStatus, $locked->status, $actor, $remarks);

            return $this->freshClaim($locked);
        });
    }

    /**
     * $decision ∈ recommended|not_recommended. Legal only from
     * COMMITTEE_RECOMMENDATION. Remarks REQUIRED when not_recommended.
     *
     * JUDGMENT CALL (flagged prominently in the handoff notes — re-verify
     * against the source PDF's Section I before shipping B4): the plan's
     * 8-stage flow (DRAFT -> SUBMITTED -> MANAGER_REVIEW ->
     * COORDINATOR_VERIFICATION -> COMMITTEE_RECOMMENDATION ->
     * HR_ELIGIBILITY_VERIFICATION -> DIRECTOR_FINAL_APPROVAL -> terminal) has
     * no separate "not recommended" terminal or branch status, and Section I
     * is described as a *recommendation* rather than a binding gate. Both
     * outcomes therefore advance the claim to HR_ELIGIBILITY_VERIFICATION,
     * with the committee's recommendation recorded on the decision row for
     * the Director to weigh at Section K. The alternative reading — that
     * `not_recommended` should REJECT the claim outright, or RETURN it for
     * correction — is equally defensible from the plan text alone and was
     * not pinned down there; this implementation chose the reading that
     * keeps every stage downstream of the committee able to still see and
     * act on the claim, since a hard stop here is much harder to walk back
     * than a soft one.
     */
    public function committeeRecommend(MediclaimClaim $claim, User $actor, string $decision, ?string $remarks = null): MediclaimClaim
    {
        if (! in_array($decision, ['recommended', 'not_recommended'], true)) {
            throw ValidationException::withMessages(['decision' => 'Unknown committee decision.']);
        }

        return DB::transaction(function () use ($claim, $actor, $decision, $remarks) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if ($locked->status !== MediclaimClaim::STATUS_COMMITTEE_RECOMMENDATION) {
                throw ValidationException::withMessages(['status' => 'This claim is not awaiting committee recommendation.']);
            }

            if ($decision === 'not_recommended') {
                $remarks = $this->assertRemarks($remarks);
            }

            $this->recordStageAssignmentCompletion($locked, MediclaimClaimAssignment::STAGE_COMMITTEE_RECOMMENDATION, $actor);

            MediclaimClaimDecision::create([
                'claim_id' => $locked->id,
                'stage' => MediclaimClaimAssignment::STAGE_COMMITTEE_RECOMMENDATION,
                'decided_by' => $actor->id,
                'decision' => $decision,
                'remarks' => $remarks,
                'decided_at' => now(),
            ]);

            $fromStatus = $locked->status;
            $locked->status = MediclaimClaim::STATUS_HR_ELIGIBILITY_VERIFICATION;
            $locked->updated_by = $actor->id;
            $locked->save();

            $this->logTransition($locked, 'COMMITTEE_' . strtoupper($decision), $fromStatus, $locked->status, $actor, $remarks);

            return $this->freshClaim($locked);
        });
    }

    /**
     * $decision ∈ verified|return. Legal only from
     * HR_ELIGIBILITY_VERIFICATION. Records
     * fields=['eligibility_verified'=>true,'policy_applicability_verified'=>true]
     * on verified. return requires remarks.
     */
    public function hrVerifyEligibility(MediclaimClaim $claim, User $actor, string $decision, ?string $remarks = null): MediclaimClaim
    {
        if (! in_array($decision, ['verified', 'return'], true)) {
            throw ValidationException::withMessages(['decision' => 'Unknown HR eligibility decision.']);
        }

        return DB::transaction(function () use ($claim, $actor, $decision, $remarks) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if ($locked->status !== MediclaimClaim::STATUS_HR_ELIGIBILITY_VERIFICATION) {
                throw ValidationException::withMessages(['status' => 'This claim is not awaiting HR eligibility verification.']);
            }

            if ($decision === 'return') {
                return $this->transitionToReturned($locked, $actor, MediclaimClaimAssignment::STAGE_HR_ELIGIBILITY_VERIFICATION, (string) $remarks);
            }

            $this->recordStageAssignmentCompletion($locked, MediclaimClaimAssignment::STAGE_HR_ELIGIBILITY_VERIFICATION, $actor);

            MediclaimClaimDecision::create([
                'claim_id' => $locked->id,
                'stage' => MediclaimClaimAssignment::STAGE_HR_ELIGIBILITY_VERIFICATION,
                'decided_by' => $actor->id,
                'decision' => 'verified',
                'remarks' => $remarks,
                'fields' => ['eligibility_verified' => true, 'policy_applicability_verified' => true],
                'decided_at' => now(),
            ]);

            $fromStatus = $locked->status;
            $locked->status = MediclaimClaim::STATUS_DIRECTOR_FINAL_APPROVAL;
            $locked->updated_by = $actor->id;
            $locked->save();

            $this->logTransition($locked, 'HR_ELIGIBILITY_VERIFIED', $fromStatus, $locked->status, $actor, $remarks);

            return $this->freshClaim($locked);
        });
    }

    /**
     * $decision ∈ approved|partially_approved|rejected. Legal only from
     * DIRECTOR_FINAL_APPROVAL. Remarks required unless plain `approved`.
     * `$approvedAmount` must not exceed `total_claimed_amount`.
     * `PolicyEligibilityService::assertWithinFloater()` is enforced unless
     * `$override` is supplied, in which case it is persisted (audited) here.
     *
     * On approved/partially_approved the claim moves straight to
     * SETTLEMENT_PENDING — per the plan's explicit instruction — rather than
     * resting at the `APPROVED`/`PARTIALLY_APPROVED` status values. Those two
     * status constants exist on the model but this service never sets them as
     * `claim.status`; which decision was made is recorded on the
     * MediclaimClaimDecision row instead.
     *
     * B6: every legal call here reaches a terminal director decision (the
     * only three values the guard clause at the top accepts), which is the
     * point the full H-K record is complete — so this is also where the
     * Section A-K final claim-form PDF is generated
     * (MediclaimClaimFormPdfService) and attached, with
     * `MediclaimClaim.final_form_document_id` set to the result. That call is
     * registered via `DB::afterCommit()` (see the bottom of this method) and
     * wrapped in a best-effort try/catch (mirroring `TicketNotifier::guard()`'s
     * report-not-swallow pattern) rather than run inline inside this
     * transaction: PDF generation depends on dompdf, which is not installed
     * in this environment as of B6 (a known, separate operational follow-up —
     * see MediclaimCardService's docblock), and even once it is, rendering a
     * document is a non-critical side effect of a decision that has already
     * legitimately happened. A rendering failure must never roll back, or
     * appear to threaten, an otherwise-valid director decision — so it runs
     * only after that decision has durably committed, and any failure is
     * reported (`report($e)`) rather than thrown back at the caller.
     */
    public function directorFinalApproval(
        MediclaimClaim $claim,
        User $director,
        string $decision,
        float $approvedAmount,
        ?string $remarks = null,
        ?MediclaimFloaterOverride $override = null
    ): MediclaimClaim {
        if (! in_array($decision, ['approved', 'partially_approved', 'rejected'], true)) {
            throw ValidationException::withMessages(['decision' => 'Unknown director decision.']);
        }

        return DB::transaction(function () use ($claim, $director, $decision, $approvedAmount, $remarks, $override) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if ($locked->status !== MediclaimClaim::STATUS_DIRECTOR_FINAL_APPROVAL) {
                throw ValidationException::withMessages(['status' => 'This claim is not awaiting director final approval.']);
            }

            if ($decision !== 'approved') {
                $remarks = $this->assertRemarks($remarks);
            }

            $claimedTotal = (float) $locked->total_claimed_amount;

            if ($decision === 'rejected') {
                $approvedAmount = 0.0;
            }

            if ($approvedAmount < 0) {
                throw ValidationException::withMessages(['approved_amount' => 'The approved amount cannot be negative.']);
            }

            if ($approvedAmount > $claimedTotal) {
                throw ValidationException::withMessages(['approved_amount' => 'The approved amount cannot exceed the total claimed amount.']);
            }

            if (in_array($decision, ['approved', 'partially_approved'], true) && $approvedAmount > 0) {
                if ($locked->enrollment_id && $locked->policy_version_id) {
                    $enrollment = MediclaimEnrollment::findOrFail($locked->enrollment_id);
                    $policyVersion = MediclaimPolicyVersion::findOrFail($locked->policy_version_id);
                    // The claim's own submitted_at, not now() — a claim
                    // submitted in one financial year must be checked
                    // against THAT year's floater even if the director's
                    // decision itself lands after the FY has rolled over.
                    $this->eligibility->assertWithinFloater(
                        $enrollment,
                        $policyVersion,
                        $approvedAmount,
                        $override,
                        $locked->submitted_at ? Carbon::parse($locked->submitted_at) : now()
                    );
                }

                if ($override !== null) {
                    $override->claim_id = $locked->id;
                    $override->enrollment_id = $override->enrollment_id ?? $locked->enrollment_id;
                    $override->approved_by = $override->approved_by ?? $director->id;
                    $override->approved_at = $override->approved_at ?? now();
                    $override->save();
                }
            }

            $this->recordStageAssignmentCompletion($locked, MediclaimClaimAssignment::STAGE_DIRECTOR_FINAL_APPROVAL, $director);

            MediclaimClaimDecision::create([
                'claim_id' => $locked->id,
                'stage' => MediclaimClaimAssignment::STAGE_DIRECTOR_FINAL_APPROVAL,
                'decided_by' => $director->id,
                'decision' => $decision,
                'remarks' => $remarks,
                'fields' => ['approved_amount' => $approvedAmount],
                'decided_at' => now(),
            ]);

            $fromStatus = $locked->status;
            $locked->total_approved_amount = $approvedAmount;
            $locked->total_disallowed_amount = max(0.0, $claimedTotal - $approvedAmount);
            $locked->status = $decision === 'rejected' ? MediclaimClaim::STATUS_REJECTED : MediclaimClaim::STATUS_SETTLEMENT_PENDING;
            $locked->updated_by = $director->id;
            $locked->save();

            $this->logTransition($locked, 'DIRECTOR_' . strtoupper($decision), $fromStatus, $locked->status, $director, $remarks);

            // B6: best-effort final claim-form PDF generation — see this
            // method's docblock for the full reasoning. Deferred to
            // DB::afterCommit() so it can only ever run once the director
            // decision above has durably committed, and wrapped in
            // try/catch + report() (TicketNotifier::guard()'s pattern) so a
            // PDF-generation failure (e.g. dompdf not yet installed) is
            // surfaced to error tracking without affecting the HTTP response
            // for what is otherwise a fully successful director decision.
            $claimId = $locked->id;
            DB::afterCommit(function () use ($claimId, $director) {
                try {
                    $claim = MediclaimClaim::findOrFail($claimId);
                    (new MediclaimClaimFormPdfService())->generate($claim, $director);
                } catch (Throwable $e) {
                    report($e);
                }
            });

            return $this->freshClaim($locked);
        });
    }

    /**
     * Single-step approval used by the simplified claim workflow: any actor
     * holding `mediclaim.claim.approve` (a fixed HR-admin role, NOT the
     * employee's manager) can approve/reject a claim directly from
     * SUBMITTED or MANAGER_REVIEW — replacing the old five-stage
     * Manager -> Coordinator -> Committee -> HR -> Director chain for claims
     * decided this way. Deliberately skips the manager-assignment/
     * confidentiality-ack checks managerDecision() enforces: this approver
     * acts under a company-wide permission, not a point-in-time
     * reporting-line snapshot, so there is no per-claim assignment row to
     * create here either.
     *
     * $decision ∈ approved|partially_approved|rejected — identical
     * vocabulary and amount-cap/floater-override rules to
     * directorFinalApproval(), reused verbatim rather than re-derived. On
     * approved/partially_approved the claim rests at
     * APPROVED/PARTIALLY_APPROVED (status constants that existed but were
     * never used as a resting state prior to this method — see
     * directorFinalApproval()'s docblock) rather than jumping straight to
     * SETTLEMENT_PENDING, because — unlike the old flow — documents are not
     * yet known to be complete at this point. autoSettleIfDocumentsComplete()
     * is what carries the claim the rest of the way once they are.
     */
    public function approveDirect(
        MediclaimClaim $claim,
        User $actor,
        string $decision,
        float $approvedAmount,
        ?string $remarks = null,
        ?MediclaimFloaterOverride $override = null
    ): MediclaimClaim {
        if (! in_array($decision, ['approved', 'partially_approved', 'rejected'], true)) {
            throw ValidationException::withMessages(['decision' => 'Unknown approval decision.']);
        }

        return DB::transaction(function () use ($claim, $actor, $decision, $approvedAmount, $remarks, $override) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if (! in_array($locked->status, [MediclaimClaim::STATUS_SUBMITTED, MediclaimClaim::STATUS_MANAGER_REVIEW], true)) {
                throw ValidationException::withMessages(['status' => 'This claim is not awaiting approval.']);
            }

            if ($decision !== 'approved') {
                $remarks = $this->assertRemarks($remarks);
            }

            $claimedTotal = (float) $locked->total_claimed_amount;

            if ($decision === 'rejected') {
                $approvedAmount = 0.0;
            }

            if ($approvedAmount < 0) {
                throw ValidationException::withMessages(['approved_amount' => 'The approved amount cannot be negative.']);
            }

            if ($approvedAmount > $claimedTotal) {
                throw ValidationException::withMessages(['approved_amount' => 'The approved amount cannot exceed the total claimed amount.']);
            }

            if (in_array($decision, ['approved', 'partially_approved'], true) && $approvedAmount > 0) {
                if ($locked->enrollment_id && $locked->policy_version_id) {
                    $enrollment = MediclaimEnrollment::findOrFail($locked->enrollment_id);
                    $policyVersion = MediclaimPolicyVersion::findOrFail($locked->policy_version_id);
                    $this->eligibility->assertWithinFloater(
                        $enrollment,
                        $policyVersion,
                        $approvedAmount,
                        $override,
                        $locked->submitted_at ? Carbon::parse($locked->submitted_at) : now()
                    );
                }

                if ($override !== null) {
                    $override->claim_id = $locked->id;
                    $override->enrollment_id = $override->enrollment_id ?? $locked->enrollment_id;
                    $override->approved_by = $override->approved_by ?? $actor->id;
                    $override->approved_at = $override->approved_at ?? now();
                    $override->save();
                }
            }

            MediclaimClaimDecision::create([
                'claim_id' => $locked->id,
                'stage' => 'APPROVAL',
                'decided_by' => $actor->id,
                'decision' => $decision,
                'remarks' => $remarks,
                'fields' => ['approved_amount' => $approvedAmount],
                'decided_at' => now(),
            ]);

            $fromStatus = $locked->status;
            $locked->total_approved_amount = $approvedAmount;
            $locked->total_disallowed_amount = max(0.0, $claimedTotal - $approvedAmount);
            $locked->status = match ($decision) {
                'rejected' => MediclaimClaim::STATUS_REJECTED,
                'partially_approved' => MediclaimClaim::STATUS_PARTIALLY_APPROVED,
                default => MediclaimClaim::STATUS_APPROVED,
            };
            $locked->updated_by = $actor->id;
            $locked->save();

            $this->logTransition($locked, 'CLAIM_' . strtoupper($decision), $fromStatus, $locked->status, $actor, $remarks);

            return $this->freshClaim($locked);
        });
    }

    /**
     * Generic "send back to the employee" usable from any active review
     * stage, for the plan's separate `/claims/{claim}/return` endpoint (B4)
     * that lets whoever currently holds the claim return it regardless of
     * which stage-specific method would otherwise apply. `$fromStage` must
     * match the claim's actual current stage (never trusted blindly) —
     * dispatches to the same `transitionToReturned()` helper the per-stage
     * `return`/`return`/`return` branches above call, so there is exactly one
     * place that supersedes an assignment and writes the RETURNED_FOR_CORRECTION
     * transition.
     */
    public function returnForCorrection(MediclaimClaim $claim, User $actor, string $fromStage, string $remarks): MediclaimClaim
    {
        $stageToStatus = [
            MediclaimClaimAssignment::STAGE_MANAGER_REVIEW => MediclaimClaim::STATUS_MANAGER_REVIEW,
            MediclaimClaimAssignment::STAGE_COORDINATOR_VERIFICATION => MediclaimClaim::STATUS_COORDINATOR_VERIFICATION,
            MediclaimClaimAssignment::STAGE_COMMITTEE_RECOMMENDATION => MediclaimClaim::STATUS_COMMITTEE_RECOMMENDATION,
            MediclaimClaimAssignment::STAGE_HR_ELIGIBILITY_VERIFICATION => MediclaimClaim::STATUS_HR_ELIGIBILITY_VERIFICATION,
            MediclaimClaimAssignment::STAGE_DIRECTOR_FINAL_APPROVAL => MediclaimClaim::STATUS_DIRECTOR_FINAL_APPROVAL,
        ];

        if (! isset($stageToStatus[$fromStage])) {
            throw ValidationException::withMessages(['from_stage' => 'Unknown review stage.']);
        }

        return DB::transaction(function () use ($claim, $actor, $fromStage, $remarks, $stageToStatus) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if ($locked->status !== $stageToStatus[$fromStage]) {
                throw ValidationException::withMessages(['status' => 'This claim is not currently at the specified review stage.']);
            }

            return $this->transitionToReturned($locked, $actor, $fromStage, $remarks);
        });
    }

    /** Legal only from SETTLEMENT_PENDING, and only once every required
     *  document is on file — "the employee uploads documents after
     *  discharge, HR gives final approval once they're all in" is the whole
     *  point of `documents_due_at`/the daily reminder sweep; settling a
     *  claim before that would make both meaningless. Creates a
     *  MediclaimSettlement row with the next sequence_no for the claim;
     *  transitions to SETTLED once cumulative settled amount reaches
     *  total_approved_amount. */
    public function recordSettlement(MediclaimClaim $claim, User $actor, float $amount, string $mode, ?string $reference = null): MediclaimClaim
    {
        if ($amount <= 0) {
            throw ValidationException::withMessages(['amount' => 'The settlement amount must be greater than zero.']);
        }

        return DB::transaction(function () use ($claim, $actor, $amount, $mode, $reference) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if ($locked->status !== MediclaimClaim::STATUS_SETTLEMENT_PENDING) {
                throw ValidationException::withMessages(['status' => 'This claim is not awaiting settlement.']);
            }

            $missing = $this->missingDocumentTypes($locked);
            if (! empty($missing)) {
                throw ValidationException::withMessages([
                    'documents' => 'This claim still has required documents outstanding: ' . implode(', ', $missing) . '. It cannot be settled until they are uploaded.',
                ]);
            }

            $nextSequence = ((int) $locked->settlements()->max('sequence_no')) + 1;

            MediclaimSettlement::create([
                'claim_id' => $locked->id,
                'sequence_no' => $nextSequence,
                'settled_amount' => $amount,
                'settlement_date' => now()->toDateString(),
                'settlement_mode' => $mode,
                'reference_number' => $reference,
                'recorded_by' => $actor->id,
            ]);

            $totalSettled = (float) $locked->settlements()->sum('settled_amount');
            $approvedTotal = (float) $locked->total_approved_amount;

            $fromStatus = $locked->status;

            if ($approvedTotal > 0 && $totalSettled >= $approvedTotal) {
                $locked->status = MediclaimClaim::STATUS_SETTLED;
                $locked->settled_at = now();
            }

            $locked->updated_by = $actor->id;
            $locked->save();

            $this->logTransition(
                $locked,
                'SETTLEMENT_RECORDED',
                $fromStatus,
                $locked->status,
                $actor,
                sprintf('Settlement #%d of %.2f recorded via %s.', $nextSequence, $amount, $mode)
            );

            return $this->freshClaim($locked);
        });
    }

    /**
     * Opportunistic completion for the simplified workflow: called after
     * every claim-document upload (see `ClaimDocumentController::store()`),
     * this carries a claim the rest of the way to SETTLED/CLOSED the moment
     * its last required document lands — replacing the old flow's separate
     * manual "Settlement" form for claims decided via approveDirect(). A
     * pure no-op (returns null, changes nothing) unless the claim is
     * currently APPROVED/PARTIALLY_APPROVED with a positive approved amount
     * and every required document (`missingDocumentTypes()`) is already on
     * file — safe to call unconditionally after any upload regardless of
     * the claim's actual status.
     *
     * Advances the status to SETTLEMENT_PENDING in its own transaction
     * first (so that transition is durably recorded even if something below
     * fails), then delegates to the existing `recordSettlement()` +
     * `closeClaim()` — the exact same two calls
     * `ReviewQueueController::decide()`'s "Final Approve" already makes for
     * the legacy flow — rather than re-implementing settlement bookkeeping.
     */
    public function autoSettleIfDocumentsComplete(MediclaimClaim $claim, User $actor): ?MediclaimClaim
    {
        $advanced = DB::transaction(function () use ($claim, $actor) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if (! in_array($locked->status, [MediclaimClaim::STATUS_APPROVED, MediclaimClaim::STATUS_PARTIALLY_APPROVED], true)) {
                return null;
            }

            if ((float) $locked->total_approved_amount <= 0) {
                return null;
            }

            if (! empty($this->missingDocumentTypes($locked))) {
                return null;
            }

            $fromStatus = $locked->status;
            $locked->status = MediclaimClaim::STATUS_SETTLEMENT_PENDING;
            $locked->updated_by = $actor->id;
            $locked->save();

            $this->logTransition(
                $locked,
                'AUTO_ADVANCED_TO_SETTLEMENT_PENDING',
                $fromStatus,
                $locked->status,
                $actor,
                'All required documents on file; advancing to settlement automatically.'
            );

            return $locked;
        });

        if ($advanced === null) {
            return null;
        }

        $settled = $this->recordSettlement($advanced->fresh(), $actor, (float) $advanced->total_approved_amount, 'auto_settlement', null);

        if ($settled->status === MediclaimClaim::STATUS_SETTLED) {
            $settled = $this->closeClaim($settled, $actor);
        }

        return $settled;
    }

    /** Legal only from SETTLED -> CLOSED. */
    public function closeClaim(MediclaimClaim $claim, User $actor): MediclaimClaim
    {
        return DB::transaction(function () use ($claim, $actor) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if ($locked->status !== MediclaimClaim::STATUS_SETTLED) {
                throw ValidationException::withMessages(['status' => 'Only a settled claim can be closed.']);
            }

            $fromStatus = $locked->status;
            $locked->status = MediclaimClaim::STATUS_CLOSED;
            $locked->closed_at = now();
            $locked->updated_by = $actor->id;
            $locked->save();

            $this->logTransition($locked, 'CLAIM_CLOSED', $fromStatus, $locked->status, $actor);

            return $this->freshClaim($locked);
        });
    }

    /** Legal ONLY from SUBMITTED/MANAGER_REVIEW — "before manager approval".
     *  Not legal once coordinator review (or later) has started. */
    public function withdraw(MediclaimClaim $claim, User $employee): MediclaimClaim
    {
        return DB::transaction(function () use ($claim, $employee) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if ((int) $locked->employee_user_id !== (int) $employee->id) {
                throw MediclaimException::forbidden('WRONG_CLAIM_OWNER', 'You may only withdraw your own claim.');
            }

            if (! in_array($locked->status, [MediclaimClaim::STATUS_SUBMITTED, MediclaimClaim::STATUS_MANAGER_REVIEW], true)) {
                throw ValidationException::withMessages(['status' => 'A claim can only be withdrawn before manager approval.']);
            }

            $fromStatus = $locked->status;

            $locked->assignments()->where('status', 'ACTIVE')->update(['status' => 'SUPERSEDED']);

            $locked->status = MediclaimClaim::STATUS_WITHDRAWN;
            $locked->withdrawn_at = now();
            $locked->updated_by = $employee->id;
            $locked->save();

            $this->logTransition($locked, 'CLAIM_WITHDRAWN', $fromStatus, $locked->status, $employee);

            return $this->freshClaim($locked);
        });
    }

    /** Legal from any non-terminal status. Remarks required. */
    public function cancel(MediclaimClaim $claim, User $actor, string $remarks): MediclaimClaim
    {
        return DB::transaction(function () use ($claim, $actor, $remarks) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            if (in_array($locked->status, self::TERMINAL_STATUSES, true)) {
                throw ValidationException::withMessages(['status' => 'This claim is already in a terminal state and cannot be cancelled.']);
            }

            $remarks = $this->assertRemarks($remarks);

            $fromStatus = $locked->status;

            $locked->assignments()->where('status', 'ACTIVE')->update(['status' => 'SUPERSEDED']);

            $locked->status = MediclaimClaim::STATUS_CANCELLED;
            $locked->cancelled_at = now();
            $locked->updated_by = $actor->id;
            $locked->save();

            $this->logTransition($locked, 'CLAIM_CANCELLED', $fromStatus, $locked->status, $actor, $remarks);

            return $this->freshClaim($locked);
        });
    }

    /** Mandatory reason. Supersedes the current stage assignment (never
     *  mutates it in place) and, when reassigning MANAGER_REVIEW, also
     *  updates `assigned_manager_id` on the claim — all in one transaction. */
    public function reassignReviewer(MediclaimClaim $claim, User $hrActor, string $stage, int $newUserId, string $reason): MediclaimClaim
    {
        if (! in_array($stage, MediclaimClaimAssignment::STAGES, true)) {
            throw ValidationException::withMessages(['stage' => 'Unknown review stage.']);
        }

        $reason = $this->assertRemarks($reason, 'reason');

        return DB::transaction(function () use ($claim, $hrActor, $stage, $newUserId, $reason) {
            $locked = MediclaimClaim::query()->lockForUpdate()->findOrFail($claim->id);

            $current = MediclaimClaimAssignment::query()
                ->where('claim_id', $locked->id)
                ->where('stage', $stage)
                ->where('status', 'ACTIVE')
                ->lockForUpdate()
                ->first();

            $new = MediclaimClaimAssignment::create([
                'claim_id' => $locked->id,
                'stage' => $stage,
                'assigned_to' => $newUserId,
                'status' => 'ACTIVE',
                'assigned_by' => $hrActor->id,
                'reassigned_reason' => $reason,
            ]);

            if ($current) {
                $current->status = 'SUPERSEDED';
                $current->superseded_by_assignment_id = $new->id;
                $current->save();
            }

            if ($stage === MediclaimClaimAssignment::STAGE_MANAGER_REVIEW) {
                $locked->assigned_manager_id = $newUserId;
                $locked->updated_by = $hrActor->id;
                $locked->save();
            }

            $this->logTransition(
                $locked,
                'REVIEWER_REASSIGNED',
                $locked->status,
                $locked->status,
                $hrActor,
                $reason,
                $current ? ['stage' => $stage, 'assigned_to' => $current->assigned_to] : null,
                ['stage' => $stage, 'assigned_to' => $newUserId]
            );

            return $this->freshClaim($locked);
        });
    }

    /**
     * Shared "return to employee" transition every per-stage `return` branch
     * and the generic returnForCorrection() dispatch through, so there is
     * exactly one place that writes the decision row, supersedes the stage
     * assignment, and flips the claim to RETURNED_FOR_CORRECTION.
     *
     * Must be called from inside a transaction that has already locked the
     * claim row and verified `$locked->status` matches `$stage`.
     */
    private function transitionToReturned(MediclaimClaim $locked, User $actor, string $stage, string $remarks): MediclaimClaim
    {
        $remarks = $this->assertRemarks($remarks);
        $fromStatus = $locked->status;

        $this->recordStageAssignmentCompletion($locked, $stage, $actor);

        MediclaimClaimDecision::create([
            'claim_id' => $locked->id,
            'stage' => $stage,
            'decided_by' => $actor->id,
            'decision' => 'returned',
            'remarks' => $remarks,
            'decided_at' => now(),
        ]);

        $locked->status = MediclaimClaim::STATUS_RETURNED_FOR_CORRECTION;
        $locked->updated_by = $actor->id;
        $locked->save();

        $this->logTransition($locked, strtoupper($stage) . '_RETURNED', $fromStatus, $locked->status, $actor, $remarks);

        return $this->freshClaim($locked);
    }

    /**
     * Resolves the claim's active MANAGER_REVIEW assignment, creating one
     * lazily when none exists — which happens only for a claim stuck at
     * SUBMITTED because `ReportingHierarchy::managerFor()` could not resolve
     * an active primary manager for the employee at submission time (see
     * submit()'s docblock, point f, and the `NO_MANAGER_ASSIGNED` event it
     * logs). Before this method existed such a claim was permanently
     * unreachable: `reassignReviewer()` only ever re-points an EXISTING
     * MANAGER_REVIEW assignment, and no code path could create the first one
     * for a claim that never got past SUBMITTED.
     *
     * Only a super admin may trigger the lazy-creation branch — anyone else
     * hitting a genuinely missing assignment has no legitimate claim to act
     * on and gets the same 403 as always. When it does trigger, the claim's
     * `assigned_manager_id` is set to the acting super admin so every other
     * check in `managerDecision()`/`acknowledgeConfidentiality()` (which key
     * off `assigned_manager_id` and the assignment's `assigned_to`) treats
     * this exactly like a normal, already-assigned manager review from here
     * on.
     */
    private function resolveOrCreateManagerAssignment(MediclaimClaim $claim, User $actor): MediclaimClaimAssignment
    {
        $assignment = MediclaimClaimAssignment::query()
            ->where('claim_id', $claim->id)
            ->where('stage', MediclaimClaimAssignment::STAGE_MANAGER_REVIEW)
            ->where('status', 'ACTIVE')
            ->lockForUpdate()
            ->first();

        if ($assignment) {
            return $assignment;
        }

        if ($claim->status !== MediclaimClaim::STATUS_SUBMITTED || ! $actor->isSuperAdmin()) {
            throw MediclaimException::forbidden('WRONG_ASSIGNED_REVIEWER', 'This claim is not assigned to you for manager review.');
        }

        $assignment = MediclaimClaimAssignment::create([
            'claim_id' => $claim->id,
            'stage' => MediclaimClaimAssignment::STAGE_MANAGER_REVIEW,
            'assigned_to' => $actor->id,
            'status' => 'ACTIVE',
            'assigned_by' => $actor->id,
        ]);

        $claim->assigned_manager_id = $actor->id;
        $claim->save();

        MediclaimClaimEventLog::record($claim, 'MANAGER_ASSIGNMENT_RESCUED', $claim->status, $claim->status, $actor, 'No manager could be resolved at submission; a super admin picked up manager review directly.');

        return $assignment;
    }

    /**
     * Marks the claim's active assignment for `$stage` completed, creating
     * one first if none exists yet (coordinator/committee/HR/director
     * reviewers are resolved from company-wide `mediclaim_reviewer_assignments`
     * rather than pre-assigned per claim the way the manager stage is, so the
     * first decision at a stage is what establishes this claim's assignment
     * row for it).
     */
    private function recordStageAssignmentCompletion(MediclaimClaim $claim, string $stage, User $actor): MediclaimClaimAssignment
    {
        $assignment = MediclaimClaimAssignment::query()
            ->where('claim_id', $claim->id)
            ->where('stage', $stage)
            ->where('status', 'ACTIVE')
            ->lockForUpdate()
            ->first();

        if (! $assignment) {
            $assignment = MediclaimClaimAssignment::create([
                'claim_id' => $claim->id,
                'stage' => $stage,
                'assigned_to' => $actor->id,
                'status' => 'ACTIVE',
                'assigned_by' => $actor->id,
            ]);
        }

        $assignment->status = 'COMPLETED';
        $assignment->save();

        return $assignment;
    }

    /** Replaces a draft's expense line items wholesale — this is a pre-submit
     *  UX-editable list; submit() is what authoritatively recalculates the
     *  claim's total from whatever rows exist at that point. */
    private function syncExpenses(MediclaimClaim $claim, array $expenses): void
    {
        $claim->expenses()->delete();

        foreach ($expenses as $row) {
            $claim->expenses()->create([
                'category' => $row['category'] ?? null,
                'description' => $row['description'] ?? null,
                'claimed_amount' => $row['claimed_amount'] ?? 0,
                'expense_date' => $row['expense_date'] ?? null,
            ]);
        }

        $claim->total_claimed_amount = (float) $claim->expenses()->sum('claimed_amount');
        $claim->save();
    }

    private function filterClaimData(array $data): array
    {
        return array_intersect_key($data, array_flip(self::EDITABLE_FIELDS));
    }

    /**
     * Historical employee identity as of this save — snake_case keys,
     * matching how every other JSON-cast column on this model round-trips
     * (there is no response-side camelCase transform anywhere in this app;
     * `NormalizeMediclaimInputCase` only normalizes *request* input).
     */
    private function buildEmployeeSnapshot(User $employee): array
    {
        return [
            'name' => $employee->name,
            'emp_code' => $employee->emp_code,
            'department' => $employee->department,
            'designation' => $employee->designation,
            'company_code' => $employee->company_code,
            'mobile_number' => $employee->mobile_number,
            'email' => $employee->email,
        ];
    }

    /**
     * Historical patient identity as of this save, resolved from the
     * currently-selected `MediclaimMember`. `null` when no member is
     * selected yet (Section B not filled in).
     */
    private function buildPatientSnapshot(?int $memberId): ?array
    {
        if (! $memberId) {
            return null;
        }

        $member = MediclaimMember::find($memberId);
        if (! $member) {
            return null;
        }

        return [
            'name' => $member->full_name,
            'relationship_type' => $member->relationship_type,
            'date_of_birth' => optional($member->date_of_birth)->toDateString(),
            'gender' => $member->gender,
        ];
    }

    private function primaryCompanyCode(User $user): string
    {
        $first = trim(explode(',', (string) $user->company_code)[0] ?? '');

        return $first !== '' ? $first : (string) $user->company_code;
    }

    private function assertRemarks(?string $remarks, string $field = 'remarks', int $min = 5): string
    {
        $trimmed = trim((string) $remarks);

        if (mb_strlen($trimmed) < $min) {
            throw ValidationException::withMessages([$field => "The {$field} must be a substantive explanation of at least {$min} characters."]);
        }

        return $trimmed;
    }

    /**
     * The same "required minus uploaded" computation
     * `mediclaim:remind-missing-documents` and `MyClaimController::index()`
     * use — now a single shared implementation on
     * `MediclaimDocumentRequirement::missingTypesFor()` rather than three
     * copies of the same diff.
     *
     * @return string[] document_type codes still missing
     */
    private function missingDocumentTypes(MediclaimClaim $claim): array
    {
        return MediclaimDocumentRequirement::missingTypesFor($claim);
    }

    private function freshClaim(MediclaimClaim $claim): MediclaimClaim
    {
        return $claim->fresh([
            'employee:id,name,email,emp_code,designation,company_code',
            'member', 'enrollment', 'policyVersion', 'hospital',
            'assignedManager:id,name,email,designation',
            'intimation', 'expenses',
            'assignments.assignee:id,name,email',
            'decisions.decidedBy:id,name,email',
            'settlements',
        ]);
    }

    /**
     * Records the claim-timeline event synchronously (inside the caller's
     * still-open transaction, so the audit row is atomic with the state
     * change) and registers a post-commit hook that hands the event off to
     * MediclaimNotifier.
     *
     * The created `MediclaimClaimEvent` row's id is captured and threaded
     * into the `DB::afterCommit()` closure (rather than just the claim/type/
     * from/to that B3 originally queued here) because
     * `MediclaimNotifier::claimTransitioned()`'s idempotency guard is
     * event-anchored: it does an atomic
     * `UPDATE mediclaim_claim_events SET notified_at = now() WHERE id = ? AND
     * notified_at IS NULL` and only dispatches when that affects exactly one
     * row, so it needs the specific event row this transition just wrote —
     * the claim alone isn't enough to tell two transitions apart. Centralised
     * here rather than repeated at all thirteen-odd call sites so every
     * transition gets identical wiring with no risk of one being missed.
     */
    private function logTransition(
        MediclaimClaim $claim,
        string $eventType,
        ?string $from,
        ?string $to,
        User $actor,
        ?string $description = null,
        ?array $before = null,
        ?array $after = null
    ): void {
        $event = MediclaimClaimEventLog::record($claim, $eventType, $from, $to, $actor, $description, $before, $after);

        DB::afterCommit(function () use ($claim, $eventType, $from, $to, $actor, $event) {
            MediclaimNotifier::claimTransitioned($claim, $eventType, $from, $to, $actor, $event->id);
        });
    }
}
