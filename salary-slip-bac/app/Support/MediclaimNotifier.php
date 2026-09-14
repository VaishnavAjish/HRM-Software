<?php

namespace App\Support;

use App\Mail\Mediclaim\MediclaimClaimDecidedMail;
use App\Mail\Mediclaim\MediclaimClaimReturnedMail;
use App\Mail\Mediclaim\MediclaimClaimSettledMail;
use App\Mail\Mediclaim\MediclaimClaimSubmittedMail;
use App\Models\Mediclaim\MediclaimCard;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimAssignment;
use App\Models\Mediclaim\MediclaimIntimation;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\Mediclaim\MediclaimReviewerAssignment;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Throwable;

/**
 * Turns a Mediclaim event into notifications for the people it concerns.
 *
 * Recipients are resolved with the same rule that decides who may *see* the
 * thing being notified about: the claim's own employee, its currently
 * assigned manager, or whoever holds the active `mediclaim_reviewer_assignments`
 * row for the stage that just started (the identical set
 * `MediclaimClaim::scopeAwaitingReviewBy()` uses to decide who may act).
 * Deriving delivery from visibility is deliberate: a notification for a claim
 * the recipient cannot open would be worse than no notification at all.
 *
 * Every public method is best-effort (see `guard()`): a notification that
 * cannot be written must never take down the workflow transition, intimation,
 * or cron sweep that triggered it. In-app rows are always written before any
 * email is attempted, so a mail failure never costs the in-app record.
 *
 * Two idempotency mechanisms, matching the two kinds of trigger:
 *
 *  - Event-anchored (every `claimTransitioned()` call): an atomic
 *    `UPDATE mediclaim_claim_events SET notified_at = now() WHERE id = ? AND
 *    notified_at IS NULL` must affect exactly one row before anything is
 *    dispatched — see `claimEventOnce()`.
 *  - Time-based/cron (`overdueReview`, `policyExpiring`, `cardExpiring`,
 *    `memberEligibilityExpiring`): an `insertOrIgnore` into
 *    `mediclaim_notification_dedupe` on a deterministic per-day
 *    `dedupe_key`, proceeding only when exactly one row was inserted — the
 *    same create-race recipe `TicketNumber` uses for its counter row, see
 *    `dedupeOnce()`.
 *
 * `officeIntimationRecorded()` is the one event with neither mechanism: it is
 * called exactly once, synchronously, from `IntimationController@store`'s
 * single `POST /me/intimations` request, with no cron/replay path that could
 * double-fire it — the same "no dedupe needed" reasoning `TicketNotifier`
 * applies to `created()`.
 *
 * ---
 *
 * ## `claimTransitioned()` event-type mapping
 *
 * `ClaimWorkflowService::logTransition()` calls `claimTransitioned()` with
 * whatever `$eventType` string that transition already writes to
 * `mediclaim_claim_events.event_type`. This is the exhaustive map from those
 * strings (see `ClaimWorkflowService.php`) to the named method(s) below that
 * actually fire:
 *
 *   CLAIM_SUBMITTED, CLAIM_RESUBMITTED         -> claimSubmitted(), then
 *                                                  managerAssigned() when a
 *                                                  manager was resolved
 *   MANAGER_APPROVE                            -> managerDecided('approve')
 *                                                  (which itself pings the
 *                                                  coordinator queue)
 *   MANAGER_REJECT                             -> managerDecided('reject')
 *   COORDINATOR_VERIFIED                       -> coordinatorVerified()
 *   COMMITTEE_RECOMMENDED, COMMITTEE_NOT_RECOMMENDED
 *                                               -> committeeRecommended()
 *   HR_ELIGIBILITY_VERIFIED                    -> hrVerified()
 *   DIRECTOR_APPROVED, DIRECTOR_PARTIALLY_APPROVED, DIRECTOR_REJECTED
 *                                               -> directorDecided()
 *   SETTLEMENT_RECORDED                        -> settled()
 *   *_RETURNED (MANAGER_REVIEW_RETURNED,
 *     COORDINATOR_VERIFICATION_RETURNED,
 *     COMMITTEE_RECOMMENDATION_RETURNED,
 *     HR_ELIGIBILITY_VERIFICATION_RETURNED,
 *     DIRECTOR_FINAL_APPROVAL_RETURNED)         -> returnedForCorrection()
 *
 * Deliberately unmapped (the atomic `notified_at` claim still runs, so the
 * event is marked handled, but nothing is dispatched) — a judgment call, not
 * an oversight:
 *
 *   CLAIM_DRAFT_CREATED, CLAIM_DRAFT_UPDATED   -> pre-submission editing;
 *                                                  nobody but the employee
 *                                                  can see a draft anyway.
 *   CLAIM_WITHDRAWN                            -> always self-triggered by
 *                                                  the employee; they already
 *                                                  know.
 *   CLAIM_CLOSED                               -> routine bookkeeping after
 *                                                  settled() already notified.
 *   CLAIM_CANCELLED, REVIEWER_REASSIGNED       -> real gaps worth notifying
 *                                                  on, but not among the 15
 *                                                  named events this phase
 *                                                  specifies; flagged in the
 *                                                  handoff notes rather than
 *                                                  invented here.
 *   NO_MANAGER_ASSIGNED, CONFIDENTIALITY_ACKNOWLEDGED
 *                                               -> written directly via
 *                                                  `MediclaimClaimEventLog::record()`
 *                                                  rather than through
 *                                                  `logTransition()`, so they
 *                                                  never reach this method at
 *                                                  all (no TODO(B7) existed
 *                                                  at either call site).
 *
 * `missingDocuments()` is implemented per the plan's method list but has no
 * caller yet: no B4 controller currently runs a document-completeness check
 * that would trigger it. It is ready for a future coordinator "request
 * missing documents" action to call directly.
 */
class MediclaimNotifier
{
    public const MODULE = 'Mediclaim';

    // -----------------------------------------------------------------
    // Central claim-lifecycle entry point
    // -----------------------------------------------------------------

    /**
     * Every ClaimWorkflowService transition funnels through here. `$eventId`
     * is the id of the `mediclaim_claim_events` row `logTransition()` just
     * wrote for this exact transition — the atomic idempotency anchor.
     */
    public static function claimTransitioned(
        MediclaimClaim $claim,
        string $eventType,
        ?string $from,
        ?string $to,
        ?User $actor,
        int $eventId
    ): void {
        self::guard(function () use ($claim, $eventType, $from, $to, $actor, $eventId) {
            if (! self::claimEventOnce($eventId)) {
                return;
            }

            self::dispatchClaimTransition($claim, $eventType, $from, $to, $actor);
        });
    }

    private static function dispatchClaimTransition(MediclaimClaim $claim, string $eventType, ?string $from, ?string $to, ?User $actor): void
    {
        if (in_array($eventType, ['CLAIM_SUBMITTED', 'CLAIM_RESUBMITTED'], true)) {
            self::claimSubmitted($claim, $actor);

            if ($to === MediclaimClaim::STATUS_MANAGER_REVIEW && $claim->assigned_manager_id) {
                self::managerAssigned($claim, $actor);
            }

            return;
        }

        if ($eventType === 'MANAGER_APPROVE') {
            self::managerDecided($claim, 'approve', $actor);

            return;
        }

        if ($eventType === 'MANAGER_REJECT') {
            self::managerDecided($claim, 'reject', $actor);

            return;
        }

        if ($eventType === 'COORDINATOR_VERIFIED') {
            self::coordinatorVerified($claim, $actor);

            return;
        }

        if (in_array($eventType, ['COMMITTEE_RECOMMENDED', 'COMMITTEE_NOT_RECOMMENDED'], true)) {
            self::committeeRecommended($claim, $eventType === 'COMMITTEE_RECOMMENDED' ? 'recommended' : 'not_recommended', $actor);

            return;
        }

        if ($eventType === 'HR_ELIGIBILITY_VERIFIED') {
            self::hrVerified($claim, $actor);

            return;
        }

        if (in_array($eventType, ['DIRECTOR_APPROVED', 'DIRECTOR_PARTIALLY_APPROVED', 'DIRECTOR_REJECTED'], true)) {
            self::directorDecided($claim, strtolower(substr($eventType, strlen('DIRECTOR_'))), $actor);

            return;
        }

        if ($eventType === 'SETTLEMENT_RECORDED') {
            self::settled($claim, $actor);

            return;
        }

        if (str_ends_with($eventType, '_RETURNED')) {
            self::returnedForCorrection($claim, $from, $actor);

            return;
        }

        // CLAIM_DRAFT_CREATED, CLAIM_DRAFT_UPDATED, CLAIM_CLOSED,
        // CLAIM_WITHDRAWN, CLAIM_CANCELLED, REVIEWER_REASSIGNED: no
        // notification, by design — see class docblock.
    }

    // -----------------------------------------------------------------
    // Named event methods
    // -----------------------------------------------------------------

    /** Office intimation recorded: tell the coordinator desk. */
    public static function officeIntimationRecorded(MediclaimIntimation $intimation, ?User $actor = null): void
    {
        self::guard(function () use ($intimation, $actor) {
            $recipients = self::stageReviewers($intimation->company_code, 'coordinator');

            if ($recipients->isEmpty()) {
                $recipients = self::adminStaffFor($intimation->company_code);
            }

            $recipients = self::excludingActor($recipients, $actor);

            self::write($recipients, [
                'title' => "Office intimation recorded: {$intimation->reference_number}",
                'description' => $intimation->is_emergency
                    ? 'An emergency treatment intimation has been recorded and needs review.'
                    : 'A new treatment intimation has been recorded.',
                'priority' => $intimation->is_emergency ? 'Urgent' : 'Normal',
                'triggered_by' => $actor?->name,
                'action_label' => 'View Intimation',
                'related_type' => 'mediclaim_intimation',
                'related_id' => $intimation->id,
            ]);
        });
    }

    /** The employee's confirmation that their claim was (re)submitted. */
    public static function claimSubmitted(MediclaimClaim $claim, ?User $actor = null): void
    {
        self::guard(function () use ($claim, $actor) {
            $employee = $claim->employee;

            if (! $employee) {
                return;
            }

            self::write(collect([$employee]), [
                'title' => "Your Mediclaim claim {$claim->claim_number} has been submitted",
                'description' => 'Your claim has been submitted and is now under review.',
                'priority' => 'Normal',
                'triggered_by' => $actor?->name,
                'action_label' => 'View Claim',
                'related_type' => 'mediclaim_claim',
                'related_id' => $claim->id,
            ]);

            self::sendMail(collect([$employee]), fn (User $r) => new MediclaimClaimSubmittedMail(
                employeeName: $r->name,
                claimNumber: (string) $claim->claim_number,
            ));
        });
    }

    /** The manager a claim now sits with, awaiting their decision. */
    public static function managerAssigned(MediclaimClaim $claim, ?User $actor = null): void
    {
        self::guard(function () use ($claim, $actor) {
            $manager = self::assignedManager($claim);
            $recipients = self::excludingActor(collect([$manager])->filter(), $actor);

            self::write($recipients, [
                'title' => "A Mediclaim claim awaits your review: {$claim->claim_number}",
                'description' => 'A claim has been assigned to you for manager review.',
                'priority' => 'Normal',
                'triggered_by' => $actor?->name,
                'action_label' => 'Review Claim',
                'related_type' => 'mediclaim_claim',
                'related_id' => $claim->id,
            ]);
        });
    }

    /** Any review stage sent the claim back to the employee. */
    public static function returnedForCorrection(MediclaimClaim $claim, ?string $fromStage = null, ?User $actor = null): void
    {
        self::guard(function () use ($claim, $actor) {
            $employee = $claim->employee;

            if (! $employee) {
                return;
            }

            $recipients = self::excludingActor(collect([$employee]), $actor);

            if ($recipients->isEmpty()) {
                return;
            }

            self::write($recipients, [
                'title' => "Your Mediclaim claim {$claim->claim_number} needs correction",
                'description' => 'Your claim has been returned and needs your attention before it can continue.',
                'priority' => 'Urgent',
                'triggered_by' => $actor?->name,
                'action_label' => 'Update Claim',
                'related_type' => 'mediclaim_claim',
                'related_id' => $claim->id,
            ]);

            self::sendMail($recipients, fn (User $r) => new MediclaimClaimReturnedMail(
                employeeName: $r->name,
                claimNumber: (string) $claim->claim_number,
            ));
        });
    }

    /** $decision ∈ approve|reject. Approving also pings the coordinator queue. */
    public static function managerDecided(MediclaimClaim $claim, string $decision, ?User $actor = null): void
    {
        self::guard(function () use ($claim, $decision, $actor) {
            $employee = $claim->employee;

            if ($employee) {
                $approved = $decision === 'approve';

                self::write(collect([$employee]), [
                    'title' => 'Your Mediclaim claim '.$claim->claim_number.' was '.($approved ? 'approved' : 'rejected').' by your manager',
                    'description' => $approved
                        ? 'Your manager has approved your claim; it now moves to the next review stage.'
                        : 'Your manager has rejected your claim.',
                    'priority' => $approved ? 'Normal' : 'Urgent',
                    'triggered_by' => $actor?->name,
                    'action_label' => 'View Claim',
                    'related_type' => 'mediclaim_claim',
                    'related_id' => $claim->id,
                ]);

                if (! $approved) {
                    self::sendMail(collect([$employee]), fn (User $r) => new MediclaimClaimDecidedMail(
                        employeeName: $r->name,
                        claimNumber: (string) $claim->claim_number,
                        outcome: 'rejected',
                    ));
                }
            }

            if ($decision === 'approve') {
                self::notifyStageQueueGrew(
                    $claim,
                    'coordinator',
                    "A Mediclaim claim awaits coordinator verification: {$claim->claim_number}",
                    'A claim has cleared manager review and awaits coordinator verification.',
                    $actor
                );
            }
        });
    }

    /** Coordinator verified the claim; it now awaits committee recommendation. */
    public static function coordinatorVerified(MediclaimClaim $claim, ?User $actor = null): void
    {
        self::guard(function () use ($claim, $actor) {
            self::notifyStageQueueGrew(
                $claim,
                'committee',
                "A Mediclaim claim awaits committee recommendation: {$claim->claim_number}",
                'A claim has cleared coordinator verification and awaits committee recommendation.',
                $actor
            );
        });
    }

    /** $decision ∈ recommended|not_recommended. Either way, HR eligibility verification is next. */
    public static function committeeRecommended(MediclaimClaim $claim, string $decision, ?User $actor = null): void
    {
        self::guard(function () use ($claim, $actor) {
            self::notifyStageQueueGrew(
                $claim,
                'hr_verification',
                "A Mediclaim claim awaits HR eligibility verification: {$claim->claim_number}",
                'The committee has recorded its recommendation; the claim now awaits HR eligibility verification.',
                $actor
            );
        });
    }

    /** HR eligibility verified; the claim now awaits director final approval. */
    public static function hrVerified(MediclaimClaim $claim, ?User $actor = null): void
    {
        self::guard(function () use ($claim, $actor) {
            self::notifyStageQueueGrew(
                $claim,
                'director',
                "A Mediclaim claim awaits director final approval: {$claim->claim_number}",
                'HR eligibility has been verified; the claim now awaits director final approval.',
                $actor
            );
        });
    }

    /**
     * $decision ∈ approved|partially_approved|rejected. On an approved/
     * partially-approved outcome, also pings the settlement queue.
     */
    public static function directorDecided(MediclaimClaim $claim, string $decision, ?User $actor = null): void
    {
        self::guard(function () use ($claim, $decision, $actor) {
            $employee = $claim->employee;

            if ($employee) {
                $label = match ($decision) {
                    'approved' => 'approved',
                    'partially_approved' => 'partially approved',
                    default => 'rejected',
                };

                self::write(collect([$employee]), [
                    'title' => "Your Mediclaim claim {$claim->claim_number} was {$label}",
                    'description' => "The director has recorded a final decision on your claim: {$label}.",
                    'priority' => $decision === 'rejected' ? 'Urgent' : 'Normal',
                    'triggered_by' => $actor?->name,
                    'action_label' => 'View Claim',
                    'related_type' => 'mediclaim_claim',
                    'related_id' => $claim->id,
                ]);

                self::sendMail(collect([$employee]), fn (User $r) => new MediclaimClaimDecidedMail(
                    employeeName: $r->name,
                    claimNumber: (string) $claim->claim_number,
                    outcome: $decision,
                ));
            }

            if (in_array($decision, ['approved', 'partially_approved'], true)) {
                self::notifyStageQueueGrew(
                    $claim,
                    'settlement',
                    "A Mediclaim claim awaits settlement: {$claim->claim_number}",
                    'The claim has been approved and now awaits settlement.',
                    $actor
                );
            }
        });
    }

    /** A settlement (full or partial) was recorded for the claim. */
    public static function settled(MediclaimClaim $claim, ?User $actor = null): void
    {
        self::guard(function () use ($claim, $actor) {
            $employee = $claim->employee;

            if (! $employee) {
                return;
            }

            $fullySettled = $claim->status === MediclaimClaim::STATUS_SETTLED;

            self::write(collect([$employee]), [
                'title' => "A settlement has been recorded for your Mediclaim claim {$claim->claim_number}",
                'description' => $fullySettled
                    ? 'Your claim has been fully settled.'
                    : 'A settlement payment has been recorded for your claim.',
                'priority' => 'Normal',
                'triggered_by' => $actor?->name,
                'action_label' => 'View Claim',
                'related_type' => 'mediclaim_claim',
                'related_id' => $claim->id,
            ]);

            self::sendMail(collect([$employee]), fn (User $r) => new MediclaimClaimSettledMail(
                employeeName: $r->name,
                claimNumber: (string) $claim->claim_number,
                fullySettled: $fullySettled,
            ));
        });
    }

    /**
     * Not currently wired to a caller (see class docblock) — provisioned for
     * a future document-completeness check. Deliberately takes only the
     * missing document *count*'s context via a generic description, never
     * the actual document type names (never disclosed in a notification).
     */
    public static function missingDocuments(MediclaimClaim $claim, array $missingDocumentTypes = [], ?User $actor = null): void
    {
        self::guard(function () use ($claim, $actor) {
            $employee = $claim->employee;

            if (! $employee) {
                return;
            }

            $recipients = self::excludingActor(collect([$employee]), $actor);

            if ($recipients->isEmpty()) {
                return;
            }

            self::write($recipients, [
                'title' => "Documents needed for your Mediclaim claim {$claim->claim_number}",
                'description' => 'One or more required documents are still missing on your claim.',
                'priority' => 'Urgent',
                'triggered_by' => $actor?->name,
                'action_label' => 'Upload Documents',
                'related_type' => 'mediclaim_claim',
                'related_id' => $claim->id,
            ]);
        });
    }

    /** Cron: a claim has sat at `$stage` past its threshold. Deduplicated per calendar day. */
    public static function overdueReview(MediclaimClaim $claim, string $stage, int $daysOverdue): void
    {
        self::guard(function () use ($claim, $stage, $daysOverdue) {
            $dedupeKey = sprintf('overdue_review:%d:%s:%s', $claim->id, $stage, now()->toDateString());

            if (! self::dedupeOnce($dedupeKey, 'overdue_review')) {
                return;
            }

            $recipients = $stage === MediclaimClaimAssignment::STAGE_MANAGER_REVIEW
                ? collect([self::assignedManager($claim)])->filter()
                : self::stageReviewers($claim->company_code, MediclaimClaim::STAGE_REVIEWER_ROLES[$stage] ?? '');

            self::write($recipients, [
                'title' => "A Mediclaim claim is overdue for review: {$claim->claim_number}",
                'description' => "This claim has been awaiting a decision for {$daysOverdue} day(s).",
                'priority' => 'Urgent',
                'triggered_by' => null,
                'action_label' => 'Review Claim',
                'related_type' => 'mediclaim_claim',
                'related_id' => $claim->id,
            ]);
        });
    }

    /** Cron: a policy version is approaching `effective_to`. Deduplicated per calendar day. */
    public static function policyExpiring(MediclaimPolicyVersion $policyVersion, int $daysUntilExpiry): void
    {
        self::guard(function () use ($policyVersion, $daysUntilExpiry) {
            $dedupeKey = sprintf('policy_expiring:%d:%s', $policyVersion->id, now()->toDateString());

            if (! self::dedupeOnce($dedupeKey, 'policy_expiring')) {
                return;
            }

            $companyCode = $policyVersion->policy?->company_code;

            if (! $companyCode) {
                return;
            }

            self::write(self::adminStaffFor($companyCode), [
                'title' => "A Mediclaim policy is expiring in {$daysUntilExpiry} day(s)",
                'description' => 'A Mediclaim policy version is approaching its effective end date and may need renewal.',
                'priority' => 'Normal',
                'triggered_by' => null,
                'action_label' => 'Review Policy',
                'related_type' => 'mediclaim_policy_version',
                'related_id' => $policyVersion->id,
            ]);
        });
    }

    /** Cron: a member's card is approaching `valid_to`. Deduplicated per calendar day. */
    public static function cardExpiring(MediclaimCard $card, int $daysUntilExpiry): void
    {
        self::guard(function () use ($card, $daysUntilExpiry) {
            $dedupeKey = sprintf('card_expiring:%d:%s', $card->id, now()->toDateString());

            if (! self::dedupeOnce($dedupeKey, 'card_expiring')) {
                return;
            }

            $employeeId = $card->member?->employee_user_id;
            $employee = $employeeId ? User::find($employeeId) : null;

            if (! $employee) {
                return;
            }

            self::write(collect([$employee]), [
                'title' => "Your Mediclaim card is expiring in {$daysUntilExpiry} day(s)",
                'description' => 'A Mediclaim card on your coverage is approaching its expiry date.',
                'priority' => 'Normal',
                'triggered_by' => null,
                'action_label' => 'View Card',
                'related_type' => 'mediclaim_card',
                'related_id' => $card->id,
            ]);
        });
    }

    /**
     * Cron: a covered child/parent is approaching the policy's max-age
     * cutoff. Deduplicated per calendar day. `$reason` must already be
     * generic (age/eligibility phrasing only) — see the calling command.
     */
    public static function memberEligibilityExpiring(MediclaimMember $member, string $reason, ?Carbon $expiresOn = null): void
    {
        self::guard(function () use ($member, $reason) {
            $dedupeKey = sprintf('member_eligibility_expiring:%d:%s', $member->id, now()->toDateString());

            if (! self::dedupeOnce($dedupeKey, 'member_eligibility_expiring')) {
                return;
            }

            $employee = $member->employee_user_id ? User::find($member->employee_user_id) : null;

            if (! $employee) {
                return;
            }

            self::write(collect([$employee]), [
                'title' => 'A covered member\'s eligibility is expiring soon',
                'description' => $reason,
                'priority' => 'Normal',
                'triggered_by' => null,
                'action_label' => 'View Family Members',
                'related_type' => 'mediclaim_member',
                'related_id' => $member->id,
            ]);
        });
    }

    // -----------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------

    /**
     * Event-anchored idempotency: proceeds only if this call is the one that
     * flips `notified_at` from null. A second concurrent/replayed call for
     * the same event row sees 0 rows affected and backs off.
     */
    private static function claimEventOnce(int $eventId): bool
    {
        $affected = DB::table('mediclaim_claim_events')
            ->where('id', $eventId)
            ->whereNull('notified_at')
            ->update(['notified_at' => now()]);

        return $affected === 1;
    }

    /**
     * Time-based idempotency: the same create-race recipe `TicketNumber`
     * uses for its counter row — `insertOrIgnore` leans on the unique index
     * on `dedupe_key` to settle a concurrent/replayed cron run, and only the
     * caller whose insert actually landed proceeds.
     */
    private static function dedupeOnce(string $dedupeKey, string $notificationType): bool
    {
        $now = now();

        $affected = DB::table('mediclaim_notification_dedupe')->insertOrIgnore([
            'dedupe_key' => $dedupeKey,
            'notification_type' => $notificationType,
            'sent_at' => $now,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return $affected === 1;
    }

    /** The claim's currently assigned manager, if any. */
    private static function assignedManager(MediclaimClaim $claim): ?User
    {
        if ($claim->relationLoaded('assignedManager') && $claim->assignedManager) {
            return $claim->assignedManager;
        }

        return $claim->assigned_manager_id ? User::find($claim->assigned_manager_id) : null;
    }

    /**
     * Active reviewers (primary and backup alike — matching
     * `MediclaimClaim::scopeAwaitingReviewBy()`'s subquery exactly) for
     * `$role` in `$companyCode`.
     */
    private static function stageReviewers(string $companyCode, string $role): Collection
    {
        if ($role === '') {
            return collect();
        }

        $today = now()->toDateString();

        $userIds = MediclaimReviewerAssignment::query()
            ->where('company_code', $companyCode)
            ->where('role', $role)
            ->where('status', 'active')
            ->where(fn ($w) => $w->whereNull('active_from')->orWhereDate('active_from', '<=', $today))
            ->where(fn ($w) => $w->whereNull('active_to')->orWhereDate('active_to', '>=', $today))
            ->pluck('user_id')
            ->unique();

        if ($userIds->isEmpty()) {
            return collect();
        }

        return User::query()->whereIn('id', $userIds)->where('is_deleted', 0)->get();
    }

    /**
     * Notifies whoever holds `$role` for the claim's company that a claim
     * newly awaits them — the shared body behind every "stage just
     * completed, the next one's queue grew" method above.
     */
    private static function notifyStageQueueGrew(MediclaimClaim $claim, string $role, string $title, string $description, ?User $actor): void
    {
        $recipients = self::excludingActor(self::stageReviewers($claim->company_code, $role), $actor);

        self::write($recipients, [
            'title' => $title,
            'description' => $description,
            'priority' => 'Normal',
            'triggered_by' => $actor?->name,
            'action_label' => 'Review Claim',
            'related_type' => 'mediclaim_claim',
            'related_id' => $claim->id,
        ]);
    }

    /**
     * Super Admin/Admin staff (role 0/1) scoped to `$companyCode`, cloning
     * `TicketNotifier::staffFor()`'s exact company-matching logic (comma
     * list, 'all'/'all-companies' wildcard). Used for admin-level concerns
     * (office-intimation fallback, policy expiry) that aren't owned by any
     * `mediclaim_reviewer_assignments` role — the same broad "staff" set the
     * rest of the app already notifies for admin-facing events, restricted
     * to 0/1 since role 2 (Manager) is a per-unit concept that doesn't apply
     * to policy/hospital administration.
     */
    private static function adminStaffFor(string $companyCode): Collection
    {
        return User::query()
            ->whereIn('role', [0, 1])
            ->where('is_deleted', 0)
            ->get()
            ->filter(function (User $staff) use ($companyCode) {
                if ((int) $staff->role === 0) {
                    return true;
                }

                $companies = array_values(array_filter(array_map(
                    'trim',
                    explode(',', (string) $staff->company_code)
                )));

                if (array_intersect(['all', 'all-companies'], $companies)) {
                    return true;
                }

                return in_array($companyCode, $companies, true);
            })->values();
    }

    private static function excludingActor(Collection $recipients, ?User $actor): Collection
    {
        return $actor ? $recipients->reject(fn (User $u) => $u->id === $actor->id) : $recipients;
    }

    private static function write(Collection $recipients, array $payload): void
    {
        $recipients = $recipients->filter()->unique('id');

        if ($recipients->isEmpty()) {
            return;
        }

        $now = now();

        $rows = $recipients->map(fn (User $recipient) => array_merge([
            'user_id' => $recipient->id,
            'module' => self::MODULE,
            'priority' => 'Normal',
            'action_url' => self::isStaff($recipient) ? '/admin/tds/mediclaim' : '/employee/tds/mediclaim',
            'read_at' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ], $payload))->all();

        Notification::insert($rows);
    }

    /** Best-effort email delivery, isolated per recipient so one failure never blocks another. */
    private static function sendMail(Collection $recipients, \Closure $mailableFactory): void
    {
        foreach ($recipients->filter() as $recipient) {
            if (blank($recipient->email)) {
                continue;
            }

            try {
                Mail::to($recipient->email)->send($mailableFactory($recipient));
            } catch (Throwable $e) {
                report($e);
            }
        }
    }

    private static function isStaff(User $user): bool
    {
        return in_array((int) $user->role, [0, 1, 2], true);
    }

    private static function guard(callable $callback): void
    {
        try {
            $callback();
        } catch (Throwable $e) {
            // Reported, not swallowed: a missing notification is a real
            // defect, it just must never fail the claim/intimation/cron
            // action that caused it.
            report($e);
        }
    }
}
