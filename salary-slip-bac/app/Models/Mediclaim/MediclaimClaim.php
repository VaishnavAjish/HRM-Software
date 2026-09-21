<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use App\Support\MediclaimClaimNumber;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * mediclaim_claims — the claim itself, the hub of the module. `status`
 * drives the workflow (see ClaimWorkflowService for the full transition
 * table); `assigned_manager_id` is a point-in-time snapshot taken at
 * submission (via the existing upward ReportingHierarchy::managerFor()),
 * never a live lookup, so a later reporting-line change can't retarget who
 * is deciding an in-flight claim. `employee_snapshot`/`patient_snapshot`
 * freeze employee/patient details at submission time.
 */
class MediclaimClaim extends Model
{
    public const STATUS_DRAFT = 'DRAFT';

    public const STATUS_SUBMITTED = 'SUBMITTED';

    public const STATUS_MANAGER_REVIEW = 'MANAGER_REVIEW';

    public const STATUS_COORDINATOR_VERIFICATION = 'COORDINATOR_VERIFICATION';

    public const STATUS_COMMITTEE_RECOMMENDATION = 'COMMITTEE_RECOMMENDATION';

    public const STATUS_HR_ELIGIBILITY_VERIFICATION = 'HR_ELIGIBILITY_VERIFICATION';

    public const STATUS_DIRECTOR_FINAL_APPROVAL = 'DIRECTOR_FINAL_APPROVAL';

    public const STATUS_APPROVED = 'APPROVED';

    public const STATUS_PARTIALLY_APPROVED = 'PARTIALLY_APPROVED';

    public const STATUS_REJECTED = 'REJECTED';

    public const STATUS_SETTLEMENT_PENDING = 'SETTLEMENT_PENDING';

    public const STATUS_SETTLED = 'SETTLED';

    public const STATUS_CLOSED = 'CLOSED';

    public const STATUS_RETURNED_FOR_CORRECTION = 'RETURNED_FOR_CORRECTION';

    public const STATUS_WITHDRAWN = 'WITHDRAWN';

    public const STATUS_CANCELLED = 'CANCELLED';

    public const STATUSES = [
        self::STATUS_DRAFT,
        self::STATUS_SUBMITTED,
        self::STATUS_MANAGER_REVIEW,
        self::STATUS_COORDINATOR_VERIFICATION,
        self::STATUS_COMMITTEE_RECOMMENDATION,
        self::STATUS_HR_ELIGIBILITY_VERIFICATION,
        self::STATUS_DIRECTOR_FINAL_APPROVAL,
        self::STATUS_APPROVED,
        self::STATUS_PARTIALLY_APPROVED,
        self::STATUS_REJECTED,
        self::STATUS_SETTLEMENT_PENDING,
        self::STATUS_SETTLED,
        self::STATUS_CLOSED,
        self::STATUS_RETURNED_FOR_CORRECTION,
        self::STATUS_WITHDRAWN,
        self::STATUS_CANCELLED,
    ];

    // Matches the treatment-type checkboxes on the actual PDF claim form
    // (Section D): OPD, Hospitalization, Surgery, Emergency, Tests Only.
    public const TREATMENT_OPD = 'opd';

    public const TREATMENT_HOSPITALIZATION = 'hospitalization';

    public const TREATMENT_SURGERY = 'surgery';

    public const TREATMENT_EMERGENCY = 'emergency';

    public const TREATMENT_TESTS_ONLY = 'tests_only';

    public const TREATMENT_TYPES = [
        self::TREATMENT_OPD,
        self::TREATMENT_HOSPITALIZATION,
        self::TREATMENT_SURGERY,
        self::TREATMENT_EMERGENCY,
        self::TREATMENT_TESTS_ONLY,
    ];

    // Treatment types for which a discharge summary is a required document.
    public const TREATMENT_TYPES_REQUIRING_DISCHARGE_SUMMARY = [
        self::TREATMENT_HOSPITALIZATION,
        self::TREATMENT_SURGERY,
    ];

    /**
     * status => the `MediclaimReviewerAssignment::ROLES` slug that stage is
     * decided by. Deliberately excludes MANAGER_REVIEW: that stage is never
     * resolved through company-wide reviewer assignments — it is always the
     * point-in-time `assigned_manager_id` snapshot taken at submission (see
     * `ClaimWorkflowService::submit()`), so it has its own branch in
     * `scopeVisibleTo()`/`scopeDecidableBy()` rather than living in this map.
     */
    public const STAGE_REVIEWER_ROLES = [
        self::STATUS_COORDINATOR_VERIFICATION => 'coordinator',
        self::STATUS_COMMITTEE_RECOMMENDATION => 'committee',
        self::STATUS_HR_ELIGIBILITY_VERIFICATION => 'hr_verification',
        self::STATUS_DIRECTOR_FINAL_APPROVAL => 'director',
        // Added so SETTLEMENT_PENDING claims are visible/decidable the exact
        // same way every other stage already is — via an active company-wide
        // 'settlement' `mediclaim_reviewer_assignments` row — instead of
        // being reachable by no one once Director Final Approval lands them
        // here. See `ReviewQueueController::STAGE_METHODS` for the matching
        // dispatch to `ClaimWorkflowService::recordSettlement()`.
        self::STATUS_SETTLEMENT_PENDING => 'settlement',
    ];

    protected $fillable = [
        'claim_number',
        'company_code',
        'employee_user_id',
        'member_id',
        'enrollment_id',
        'policy_version_id',
        'hospital_id',
        'assigned_manager_id',
        'intimation_id',
        'status',
        'current_revision',
        'employee_snapshot',
        'patient_snapshot',
        'nature_of_illness',
        'first_symptom_date',
        'initial_symptoms',
        'first_consultation_date',
        'treating_doctor_name',
        'is_medico_legal_case',
        'reported_to_police',
        'police_station_details',
        'treatment_type',
        'is_network_hospital',
        'non_network_hospital_name',
        'non_network_reason',
        'admission_at',
        'discharge_at',
        'documents_due_at',
        'is_ongoing_treatment',
        'treatment_description',
        'total_claimed_amount',
        'total_approved_amount',
        'total_disallowed_amount',
        'declaration_accepted',
        'declaration_version',
        'declaration_accepted_at',
        'declaration_ip',
        'declaration_user_agent',
        'final_form_document_id',
        'submission_idempotency_key',
        'submitted_at',
        'withdrawn_at',
        'cancelled_at',
        'settled_at',
        'closed_at',
        'created_by',
        'updated_by',
    ];

    protected $appends = [
        'approved_amount',
        'approvedAmount',
        'totalApprovedAmount',
        'totalClaimedAmount',
    ];

    public function getClaimNumberAttribute(?string $value = null): ?string
    {
        $raw = $value ?? ($this->attributes['claim_number'] ?? null);
        if ($raw === null || $raw === '') {
            return null;
        }

        if (preg_match('/^(NS|NI|SD|SI)-/', $raw)) {
            return $raw;
        }

        $company = $this->company_code;
        $employee = $this->relationLoaded('employee') ? $this->employee : $this->employee()->first();
        $branch = $employee?->unit ?: $employee?->branch ?: ($this->employee_snapshot['unit'] ?? $this->employee_snapshot['branch'] ?? null);
        $empCode = $employee?->emp_code ?: ($this->employee_snapshot['emp_code'] ?? '0001');
        $date = $this->submitted_at ? Carbon::parse($this->submitted_at)->format('Y-m-d') : ($this->created_at ? Carbon::parse($this->created_at)->format('Y-m-d') : now()->format('Y-m-d'));

        $prefix = MediclaimClaimNumber::resolvePrefix($company, $branch);
        $formatted = sprintf('%s-%s-%s', $prefix, $empCode, $date);

        try {
            if ($this->id && !DB::table('mediclaim_claims')->where('claim_number', $formatted)->where('id', '!=', $this->id)->exists()) {
                DB::table('mediclaim_claims')->where('id', $this->id)->update(['claim_number' => $formatted]);
                $this->attributes['claim_number'] = $formatted;
            }
        } catch (Throwable $e) {
        }

        return $formatted;
    }

    public function getApprovedAmountAttribute(): ?float
    {
        $raw = $this->attributes['total_approved_amount'] ?? null;
        if ($raw !== null && (float) $raw > 0) {
            return (float) $raw;
        }

        $status = $this->attributes['status'] ?? null;
        if (in_array($status, [self::STATUS_APPROVED, self::STATUS_PARTIALLY_APPROVED, self::STATUS_SETTLEMENT_PENDING, self::STATUS_SETTLED, self::STATUS_CLOSED], true)) {
            if ($this->relationLoaded('decisions') && $this->decisions) {
                $decision = $this->decisions
                    ->filter(fn ($d) => !empty($d->fields['approved_amount']))
                    ->sortByDesc('decided_at')
                    ->first();
                if ($decision && !empty($decision->fields['approved_amount'])) {
                    return (float) $decision->fields['approved_amount'];
                }
            }
            if ($raw !== null && (float) $raw > 0) {
                return (float) $raw;
            }
            if ($status !== self::STATUS_PARTIALLY_APPROVED) {
                $claimed = $this->attributes['total_claimed_amount'] ?? null;
                if ($claimed !== null && (float) $claimed > 0) {
                    return (float) $claimed;
                }
            }
        }

        return $raw !== null ? (float) $raw : null;
    }

    public function getTotalApprovedAmountAttribute(): ?float
    {
        return $this->getApprovedAmountAttribute();
    }

    public function getTotalClaimedAmountAttribute(): ?float
    {
        $raw = $this->attributes['total_claimed_amount'] ?? null;
        return $raw !== null ? (float) $raw : null;
    }

    protected function casts(): array
    {
        return [
            'employee_snapshot' => 'array',
            'patient_snapshot' => 'array',
            'initial_symptoms' => 'array',
            'first_symptom_date' => 'date',
            'first_consultation_date' => 'date',
            'is_medico_legal_case' => 'boolean',
            'reported_to_police' => 'boolean',
            'is_network_hospital' => 'boolean',
            'admission_at' => 'datetime',
            'discharge_at' => 'datetime',
            'documents_due_at' => 'datetime',
            'is_ongoing_treatment' => 'boolean',
            'total_claimed_amount' => 'decimal:2',
            'total_approved_amount' => 'decimal:2',
            'total_disallowed_amount' => 'decimal:2',
            'declaration_accepted' => 'boolean',
            'declaration_accepted_at' => 'datetime',
            'submitted_at' => 'datetime',
            'withdrawn_at' => 'datetime',
            'cancelled_at' => 'datetime',
            'settled_at' => 'datetime',
            'closed_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(User::class, 'employee_user_id');
    }

    public function member()
    {
        return $this->belongsTo(MediclaimMember::class, 'member_id');
    }

    public function enrollment()
    {
        return $this->belongsTo(MediclaimEnrollment::class, 'enrollment_id');
    }

    public function policyVersion()
    {
        return $this->belongsTo(MediclaimPolicyVersion::class, 'policy_version_id');
    }

    public function hospital()
    {
        return $this->belongsTo(MediclaimHospital::class, 'hospital_id');
    }

    public function assignedManager()
    {
        return $this->belongsTo(User::class, 'assigned_manager_id');
    }

    /** The intimation this claim was submitted against, if any (forward link). */
    public function intimation()
    {
        return $this->belongsTo(MediclaimIntimation::class, 'intimation_id');
    }

    public function finalFormDocument()
    {
        return $this->belongsTo(\App\Models\Document::class, 'final_form_document_id');
    }

    public function expenses()
    {
        return $this->hasMany(MediclaimClaimExpense::class, 'claim_id');
    }

    public function revisions()
    {
        return $this->hasMany(MediclaimClaimRevision::class, 'claim_id');
    }

    public function assignments()
    {
        return $this->hasMany(MediclaimClaimAssignment::class, 'claim_id');
    }

    public function decisions()
    {
        return $this->hasMany(MediclaimClaimDecision::class, 'claim_id');
    }

    public function events()
    {
        return $this->hasMany(MediclaimClaimEvent::class, 'claim_id');
    }

    public function settlements()
    {
        return $this->hasMany(MediclaimSettlement::class, 'claim_id');
    }

    public function documentLinks()
    {
        return $this->morphMany(MediclaimDocumentLink::class, 'linkable');
    }

    public function intimations()
    {
        return $this->hasMany(MediclaimIntimation::class, 'linked_claim_id');
    }

    public function floaterOverrides()
    {
        return $this->hasMany(MediclaimFloaterOverride::class, 'claim_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }

    /**
     * 404-concealment scope for the self-service/manager/reviewer-facing
     * `Mediclaim\ClaimController@show`/`update` endpoints — never a manual
     * `if (!authorized) abort(403)`, matching `Ticket::scopeVisibleTo()`'s
     * exact shape (scope the query, then `findOrFail()`/`find()`).
     *
     * Visible to: a super admin (unrestricted); the claim's own employee; the
     * manager it is currently/was ever snapshotted to (so a manager retains
     * visibility into a claim's later history, not only while it sits at
     * MANAGER_REVIEW — see `assignedManager()`); or the actor currently
     * holding it for review (`awaitingReviewBy()` below).
     *
     * Deliberately does NOT fold in a company-wide "has mediclaim.claim.read"
     * branch — for admin/HR read access, `ScopesCompany::applyCompanyScope()`
     * on `Mediclaim\Admin\ClaimController` is the intended (broader) scope
     * instead, per the plan's B4 reconciliation notes.
     */
    public function scopeVisibleTo(Builder $query, ?User $actor): Builder
    {
        if (! $actor) {
            return $query->whereRaw('1 = 0');
        }

        if ($actor->isSuperAdmin()) {
            return $query;
        }

        return $query->where(function (Builder $q) use ($actor) {
            $q->where('employee_user_id', $actor->id)
                ->orWhere('assigned_manager_id', $actor->id)
                ->orWhere(fn (Builder $rq) => $rq->awaitingReviewBy($actor));
        });
    }

    /**
     * Claims currently sitting at a review stage (coordinator, committee, HR
     * eligibility, director) that `$actor` may act on — either because they
     * hold an explicit per-claim `MediclaimClaimAssignment` for that stage
     * (created by `ClaimWorkflowService::reassignReviewer()`), or — the
     * default, un-reassigned path — because they hold an active company-wide
     * `MediclaimReviewerAssignment` for the role that owns the claim's
     * current stage.
     *
     * This second branch exists because `ClaimWorkflowService`'s
     * `recordStageAssignmentCompletion()` creates a claim's
     * `MediclaimClaimAssignment` row for these four stages lazily, AT THE
     * MOMENT OF DECISION — there is deliberately no pre-existing "assigned to
     * me" row for a coordinator/committee/HR/director reviewer to match
     * against before they have ever acted on a given claim. Without this
     * fallback, a reviewer could never open a claim they have not yet
     * decided on (`GET /claims/{claim}`) even though `GET /reviews/pending`
     * (which must use the same reviewer-assignment resolution to build its
     * list in the first place) already tells them it is theirs to review.
     * MANAGER_REVIEW is excluded on purpose — see `STAGE_REVIEWER_ROLES`'s
     * docblock.
     *
     * Used directly by `Mediclaim\ReviewQueueController@index`
     * (`GET /reviews/pending`), and composed into `scopeVisibleTo()` and
     * `scopeDecidableBy()` below.
     *
     * A super admin bypasses all of the above and matches every claim
     * currently sitting at ANY review stage — including MANAGER_REVIEW,
     * which is otherwise excluded from this method entirely (see
     * `STAGE_REVIEWER_ROLES`'s docblock). Without this, `GET /reviews/pending`
     * returns nothing for a super admin who holds no personal reviewer
     * assignment row and isn't literally anyone's `assigned_manager_id` —
     * which is every claim, for an account used purely to administer the
     * module rather than sit in anyone's real reporting line. This mirrors
     * `scopeVisibleTo()`'s own unrestricted-for-super-admin behavior.
     */
    public function scopeAwaitingReviewBy(Builder $query, User $actor): Builder
    {
        if ($actor->isSuperAdmin()) {
            // STATUS_SUBMITTED is included here too (super admin only) —
            // that is the state a claim is left in when
            // ReportingHierarchy::managerFor() could not resolve an active
            // manager for the employee at submission time (see submit()'s
            // docblock, point (f)). Such a claim has no assigned reviewer at
            // all, so it would otherwise be invisible everywhere: excluded
            // from this list (no reviewer role owns SUBMITTED), and excluded
            // from the admin Claims tab's finalized-only default. See
            // ClaimWorkflowService::managerDecision()'s matching rescue path.
            // APPROVED/PARTIALLY_APPROVED are included too — the simplified
            // workflow's post-approveDirect() "awaiting documents" resting
            // state (see that method's docblock) — so a super admin keeps
            // visibility into a claim all the way through document upload,
            // same as every other stage here.
            return $query->whereIn('status', array_merge(
                [self::STATUS_SUBMITTED, self::STATUS_MANAGER_REVIEW, self::STATUS_APPROVED, self::STATUS_PARTIALLY_APPROVED],
                array_keys(self::STAGE_REVIEWER_ROLES)
            ));
        }

        return $query->where(function (Builder $q) use ($actor) {
            // Simplified workflow: whoever holds `mediclaim.claim.approve` (a
            // fixed, company-wide HR-admin permission — not a per-claim or
            // per-stage assignment like every branch below) can see and
            // decide EVERY claim currently sitting at SUBMITTED or
            // MANAGER_REVIEW, the instant it's submitted — see
            // ClaimWorkflowService::approveDirect()'s docblock. Checked via
            // the same AuthorizationEngine the `permission:` route
            // middleware already uses, so this stays consistent with
            // whatever grants that middleware honors, rather than
            // re-deriving role membership here. Purely additive: every
            // branch below (the five legacy per-stage reviewer-role checks)
            // is untouched. APPROVED/PARTIALLY_APPROVED are included too, so
            // the approver keeps visibility (via the admin "Pending
            // Document" tab) into a claim they approved while it's waiting
            // on the employee's documents — nothing is actually decidable
            // at that status (ReviewQueueController::STAGE_METHODS has no
            // entry for it), so `decide()` correctly 422s if attempted; this
            // branch only grants read visibility, matching how
            // SETTLEMENT_PENDING already works for the settlement role.
            if (app(\App\Services\Authorization\AuthorizationEngine::class)->decide($actor, 'mediclaim.claim.approve')->allowed) {
                $q->orWhereIn('status', [
                    self::STATUS_SUBMITTED,
                    self::STATUS_MANAGER_REVIEW,
                    self::STATUS_APPROVED,
                    self::STATUS_PARTIALLY_APPROVED,
                ]);
            }

            foreach (self::STAGE_REVIEWER_ROLES as $status => $role) {
                $q->orWhere(function (Builder $branch) use ($status, $role, $actor) {
                    $branch->where('status', $status)
                        ->where(function (Builder $inner) use ($status, $role, $actor) {
                            $inner->whereHas('assignments', function (Builder $aq) use ($status, $actor) {
                                $aq->where('stage', $status)
                                    ->where('status', 'ACTIVE')
                                    ->where('assigned_to', $actor->id);
                            })->orWhereExists(function ($sub) use ($role, $actor) {
                                $sub->select(DB::raw(1))
                                    ->from('mediclaim_reviewer_assignments')
                                    ->whereColumn('mediclaim_reviewer_assignments.company_code', 'mediclaim_claims.company_code')
                                    ->where('mediclaim_reviewer_assignments.user_id', $actor->id)
                                    ->where('mediclaim_reviewer_assignments.role', $role)
                                    ->where('mediclaim_reviewer_assignments.status', 'active')
                                    ->where(function ($w) {
                                        $w->whereNull('mediclaim_reviewer_assignments.active_from')
                                            ->orWhereRaw('mediclaim_reviewer_assignments.active_from <= CURRENT_DATE');
                                    })
                                    ->where(function ($w) {
                                        $w->whereNull('mediclaim_reviewer_assignments.active_to')
                                            ->orWhereRaw('mediclaim_reviewer_assignments.active_to >= CURRENT_DATE');
                                    });
                            });
                        });
                });
            }
        });
    }

    /**
     * Whether `$actor` may currently record a review decision on this claim
     * — the authorization gate `Mediclaim\ReviewQueueController@decide` and
     * `Mediclaim\ClaimReviewController@return` apply BEFORE calling into
     * `ClaimWorkflowService`.
     *
     * This matters beyond mere 404-concealment: `ClaimWorkflowService`'s
     * `coordinatorVerify()`, `committeeRecommend()`, `hrVerifyEligibility()`
     * and `directorFinalApproval()` do NOT themselves check the calling
     * actor's identity against any assignment (only `managerDecision()`
     * does, via `assigned_manager_id` + the confidentiality-ack gate) — they
     * trust the caller to already be authorized. Skipping this scope in the
     * controller would let any authenticated holder of the relevant
     * `mediclaim.claim.*.decide` permission decide a claim actually held by
     * a *different* reviewer.
     */
    public function scopeDecidableBy(Builder $query, User $actor): Builder
    {
        return $query->where(function (Builder $q) use ($actor) {
            $q->where(function (Builder $mgr) use ($actor) {
                $mgr->where('status', self::STATUS_MANAGER_REVIEW)
                    ->where('assigned_manager_id', $actor->id);
            })->orWhere(fn (Builder $rq) => $rq->awaitingReviewBy($actor));
        });
    }
}
