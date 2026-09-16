<?php

namespace App\Services\Mediclaim;

use App\Models\Mediclaim\MediclaimCard;
use App\Models\Mediclaim\MediclaimEnrollment;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimMemberChangeRequest;
use App\Models\User;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Employee-submitted add/update/remove requests against covered members,
 * HR-decided. An employee never edits `mediclaim_members` directly — every
 * change goes through a `MediclaimMemberChangeRequest` row so HR can review
 * it (and so the prior state is preserved for audit) before it takes effect.
 */
class MediclaimMemberService
{
    public function __construct(
        private readonly PolicyEligibilityService $eligibility,
        private readonly MediclaimCardService $cards,
    ) {
    }

    /**
     * Self-service: the employee submits and the change is applied
     * immediately — no HR approval wait. Every validation
     * `decideChangeRequest()` already enforces on approval (spouse overlap,
     * max-2-children, child/parent age limits, member-eligibility
     * re-check) still runs in full; this only removes the "a human clicks
     * approve" step. `decided_by` on the resulting row is the employee
     * themselves, and `decision_remarks` records that this was a
     * self-service auto-approval, so the audit trail stays honest about how
     * the change was actually authorized rather than implying HR reviewed
     * it.
     *
     * Every eligible employee's own "self" coverage and card is also kept
     * up to date here via `ensureSelfCoverageIssued()` — harmless to call
     * again on every subsequent family member change (it no-ops once the
     * card already exists).
     */
    public function submitAndAutoApply(User $employee, array $data): MediclaimMemberChangeRequest
    {
        $request = $this->submitChangeRequest($employee, $data);

        $decided = $this->decideChangeRequest(
            $request,
            $employee,
            'approve',
            'Self-service: submitted and applied automatically by the employee — no HR review required for family member changes.'
        );

        $this->ensureSelfCoverageIssued($employee);

        return $decided;
    }

    /**
     * Every employee gets their ₹3,00,000 Mediclaim floater automatically
     * once they clear the joining waiting period — there is no "fill in
     * your details first" gate. This ensures the employee themselves has a
     * "self" `mediclaim_members` row (nothing ever created this
     * automatically before this — every other self-service path only ever
     * creates spouse/child/parent rows) and, the first time this runs for
     * them, issues their own Mediclaim card. Safe and cheap to call
     * repeatedly — it no-ops once an active card already exists — so it's
     * called from every natural touch-point (opening "My Coverage", saving
     * a family member change, and the admin bulk-issue action) rather than
     * from a single gate that would leave employees who never happen to
     * trigger it without a card.
     *
     * The card step is deliberately best-effort: `MediclaimCardService::
     * generate()` renders a PDF via dompdf, an optional dependency whose
     * installation is a separate operational follow-up (see that service's
     * class docblock) and isn't guaranteed present in every environment. A
     * PDF-rendering failure here must never break whatever the caller was
     * actually doing (viewing coverage, saving a family member), so it's
     * logged and swallowed rather than thrown. The "self" member row itself
     * (data, not the PDF) always gets created regardless, since that part
     * cannot fail for environmental reasons.
     *
     * @return string One of: `not_eligible`, `already_issued`, `issued`, `card_failed`.
     */
    public function ensureSelfCoverageIssued(User $employee): string
    {
        $enrollment = $this->eligibility->resolveOrCreateEnrollment($employee);

        if (! $enrollment) {
            return 'not_eligible';
        }

        $selfMember = MediclaimMember::query()
            ->where('enrollment_id', $enrollment->id)
            ->where('relationship_type', 'self')
            ->first();

        if (! $selfMember) {
            $selfMember = MediclaimMember::create([
                'enrollment_id' => $enrollment->id,
                'employee_user_id' => $employee->id,
                'full_name' => $employee->name,
                'relationship_type' => 'self',
                'date_of_birth' => $employee->dob,
                'gender' => $employee->gender,
                'status' => 'active',
                'effective_from' => $enrollment->enrolled_at ?? now()->toDateString(),
                'created_by' => $employee->id,
            ]);
        }

        $hasActiveCard = MediclaimCard::query()
            ->where('member_id', $selfMember->id)
            ->where('status', 'active')
            ->exists();

        if ($hasActiveCard) {
            return 'already_issued';
        }

        try {
            $this->cards->generate($selfMember, $employee);

            return 'issued';
        } catch (Throwable $e) {
            MediclaimActivityLogSupport::log(
                $employee,
                'SELF_CARD_AUTO_GENERATION_FAILED',
                'mediclaim_member',
                $selfMember->id,
                null,
                ['error' => $e->getMessage()],
                'Automatic Mediclaim card generation failed for this employee.',
                $employee->company_code
            );

            return 'card_failed';
        }
    }

    public function submitChangeRequest(User $employee, array $data): MediclaimMemberChangeRequest
    {
        $type = $data['request_type'] ?? null;

        if (! in_array($type, MediclaimMemberChangeRequest::REQUEST_TYPES, true)) {
            throw ValidationException::withMessages(['request_type' => 'request_type must be one of: ' . implode(', ', MediclaimMemberChangeRequest::REQUEST_TYPES) . '.']);
        }

        $enrollmentId = $data['enrollment_id'] ?? null;
        $enrollment = $enrollmentId
            ? MediclaimEnrollment::query()->where('employee_user_id', $employee->id)->findOrFail($enrollmentId)
            : $this->eligibility->resolveOrCreateEnrollment($employee);

        if (! $enrollment) {
            throw ValidationException::withMessages(['enrollment_id' => 'Mediclaim coverage is not yet active for this employee.']);
        }

        $memberId = $data['member_id'] ?? null;

        if (in_array($type, ['update', 'remove'], true) && ! $memberId) {
            throw ValidationException::withMessages(['member_id' => 'member_id is required for an update or remove request.']);
        }

        if ($memberId) {
            // Ownership check, resolved (not discarded) so a bad id 404s
            // before a transaction ever opens.
            MediclaimMember::query()->where('enrollment_id', $enrollment->id)->findOrFail($memberId);
        }

        return DB::transaction(fn () => MediclaimMemberChangeRequest::create([
            'employee_user_id' => $employee->id,
            'enrollment_id' => $enrollment->id,
            'member_id' => $memberId,
            'request_type' => $type,
            'proposed_values' => $data['proposed_values'] ?? [],
            'status' => 'pending',
            'effective_from' => $data['effective_from'] ?? now()->toDateString(),
        ]));
    }

    /**
     * $decision ∈ approve|reject. On approve, applies the requested change to
     * `MediclaimMember` (create for add, mutate for update, status flip for
     * remove) — but only after re-validating eligibility at the proposed
     * `effective_from` date via PolicyEligibilityService, so an invalid
     * resulting state (too many children, over-age, overlapping coverage) is
     * rejected with a validation error rather than silently applied. The
     * member's pre-change values are preserved in `previous_values` before
     * any write.
     */
    public function decideChangeRequest(MediclaimMemberChangeRequest $request, User $hrActor, string $decision, ?string $remarks = null): MediclaimMemberChangeRequest
    {
        if (! in_array($decision, ['approve', 'reject'], true)) {
            throw ValidationException::withMessages(['decision' => 'decision must be approve or reject.']);
        }

        return DB::transaction(function () use ($request, $hrActor, $decision, $remarks) {
            $locked = MediclaimMemberChangeRequest::query()->lockForUpdate()->findOrFail($request->id);

            if ($locked->status !== 'pending') {
                throw ValidationException::withMessages(['status' => 'Only a pending change request can be decided.']);
            }

            if ($decision === 'reject') {
                if (mb_strlen(trim((string) $remarks)) < 5) {
                    throw ValidationException::withMessages(['remarks' => 'A substantive remarks of at least 5 characters is required to reject a change request.']);
                }

                $locked->status = 'rejected';
                $locked->decided_by = $hrActor->id;
                $locked->decided_at = now();
                $locked->decision_remarks = $remarks;
                $locked->save();

                return $locked->fresh();
            }

            $enrollment = MediclaimEnrollment::findOrFail($locked->enrollment_id);
            $policyVersion = $enrollment->policyVersion;
            $proposed = $locked->proposed_values ?? [];
            $effectiveFrom = Carbon::parse($locked->effective_from ?? now());

            if ($locked->request_type === 'remove') {
                $member = MediclaimMember::query()->lockForUpdate()->findOrFail($locked->member_id);
                $locked->previous_values = $member->only(['status', 'effective_to']);
                $member->status = 'removed';
                $member->effective_to = $effectiveFrom->toDateString();
                $member->updated_by = $hrActor->id;
                $member->save();
            } else {
                if ($locked->request_type === 'update') {
                    $member = MediclaimMember::query()->lockForUpdate()->findOrFail($locked->member_id);
                    $locked->previous_values = $member->only([
                        'full_name', 'relationship_type', 'date_of_birth', 'gender', 'status', 'effective_from', 'effective_to',
                    ]);
                } else {
                    $member = new MediclaimMember([
                        'enrollment_id' => $enrollment->id,
                        'employee_user_id' => $locked->employee_user_id,
                        'status' => 'active',
                        'effective_from' => $effectiveFrom->toDateString(),
                    ]);
                }

                $member->fill(array_intersect_key($proposed, array_flip([
                    'full_name', 'relationship_type', 'date_of_birth', 'gender',
                ])));
                $member->status = 'active';

                if (isset($proposed['effective_from'])) {
                    $member->effective_from = $proposed['effective_from'];
                }

                // Spouse overlap: the policy covers exactly one active spouse
                // at a time. A same-slot addition/update that would leave two
                // simultaneously-active spouse rows is rejected here.
                if ($member->relationship_type === 'spouse') {
                    $overlap = MediclaimMember::query()
                        ->where('enrollment_id', $enrollment->id)
                        ->where('relationship_type', 'spouse')
                        ->where('status', 'active')
                        ->when($member->exists, fn ($q) => $q->where('id', '!=', $member->id))
                        ->exists();

                    if ($overlap) {
                        throw ValidationException::withMessages(['relationship_type' => 'This enrollment already has an active spouse covered — remove the existing spouse before adding a new one.']);
                    }
                }

                // Max-covered-children: checked explicitly (not only via
                // validateMemberEligibility below) because an about-to-be-added
                // child is not yet a DB row, so a count of existing active
                // children would otherwise be one short of what adding this
                // one would actually produce.
                if ($locked->request_type === 'add' && $member->relationship_type === 'child' && $policyVersion) {
                    $maxChildren = (int) ($policyVersion->rules['max_covered_children'] ?? PHP_INT_MAX);
                    $existingChildren = $this->eligibility->countActiveChildren((int) $locked->employee_user_id, $effectiveFrom);

                    if ($existingChildren >= $maxChildren) {
                        throw ValidationException::withMessages(['relationship_type' => "This policy covers at most {$maxChildren} children; the employee already has {$existingChildren} active."]);
                    }
                }

                if ($policyVersion) {
                    $result = $this->eligibility->validateMemberEligibility($member, $policyVersion, $effectiveFrom);
                    if (! $result['ok']) {
                        throw ValidationException::withMessages(['proposed_values' => $result['reasons']]);
                    }
                }

                $member->updated_by = $hrActor->id;
                $member->save();
            }

            $locked->member_id = $member->id;
            $locked->status = 'approved';
            $locked->decided_by = $hrActor->id;
            $locked->decided_at = now();
            $locked->decision_remarks = $remarks;
            $locked->save();

            return $locked->fresh(['member']);
        });
    }
}
