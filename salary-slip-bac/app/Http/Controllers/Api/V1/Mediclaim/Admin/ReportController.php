<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimCard;
use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimDecision;
use App\Models\Mediclaim\MediclaimClaimExpense;
use App\Models\Mediclaim\MediclaimEnrollment;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\Mediclaim\MediclaimSettlement;
use App\Services\Authorization\AuthorizationEngine;
use App\Support\CsvSanitizer;
use App\Support\MediclaimActivityLogSupport;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * `GET /reports` (dashboard summary or a single `reportType`'s detail rows),
 * `GET /reports/export` (CSV of one `reportType`'s detail rows).
 *
 * B4 left this controller INTENTIONALLY FOUNDATIONAL (see its own docblock,
 * kept in spirit below): claim counts by status/stage and requested/
 * approved/disallowed/settled amounts, plus a hospital-usage breakdown, all
 * real, working, company-scoped aggregates. This phase (B8) is the rest of
 * the plan's report catalogue — enrolled employees, covered family members,
 * rejection/disallowance reasons, approval turnaround time, pending/overdue
 * work, and expiring policies/cards/member-eligibility — plus CSV export
 * with formula-injection sanitization and `.reveal`-gated sensitive detail.
 *
 * Shape chosen: B4's original `index()` had no `reportType` branching at
 * all (one bundle-everything response), so there was no existing convention
 * to match here. `index()` keeps that bundle as its default ("dashboard")
 * response — extended with summary numbers for every new report — and grows
 * an optional `?reportType=` param that switches it to a single report's
 * full row-level detail (the shape CSV export also needs). This is additive
 * only: every key the original `index()` returned is still returned
 * unchanged when no `reportType` is given.
 */
class ReportController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    private const PENDING_STATUSES = [
        MediclaimClaim::STATUS_MANAGER_REVIEW,
        MediclaimClaim::STATUS_COORDINATOR_VERIFICATION,
        MediclaimClaim::STATUS_COMMITTEE_RECOMMENDATION,
        MediclaimClaim::STATUS_HR_ELIGIBILITY_VERIFICATION,
        MediclaimClaim::STATUS_DIRECTOR_FINAL_APPROVAL,
    ];

    /**
     * Detail report types selectable via `?reportType=`. "dashboard" (the
     * default / no param) is handled separately by `dashboard()` and is
     * deliberately not exportable as a flat CSV — it is a bundle of several
     * differently-shaped aggregates, not one row set.
     */
    private const DETAIL_REPORT_TYPES = [
        'enrolled_employees',
        'covered_members',
        'claims',
        'amounts',
        'hospital_usage',
        'rejection_reasons',
        'turnaround',
        'pending_overdue',
        'expiring_policies',
        'expiring_cards',
        'member_eligibility_expiry',
    ];

    /**
     * Section C/D free-text and medical-history fields — diagnosis-adjacent
     * detail that must NEVER appear in a standard report, only behind the
     * `?includeSensitive=1` flag gated by `mediclaim.report.reveal` below.
     * Mirrors the plan's explicit list (`nature_of_illness`,
     * `treatment_description`, "medical-history fields") — read broadly to
     * cover every Section C field the actual claim-form PDF groups under
     * "Medical History / Nature of Illness", since a narrower list would
     * leak diagnosis-adjacent detail (first symptoms, treating doctor,
     * medico-legal/police detail) through a side door.
     */
    private const SENSITIVE_CLAIM_COLUMNS = [
        'natureOfIllness' => 'Nature of Illness',
        'firstSymptomDate' => 'First Symptom Date',
        'initialSymptoms' => 'Initial Symptoms',
        'firstConsultationDate' => 'First Consultation Date',
        'treatingDoctorName' => 'Treating Doctor',
        'isMedicoLegalCase' => 'Medico-Legal Case',
        'reportedToPolice' => 'Reported To Police',
        'policeStationDetails' => 'Police Station Details',
        'treatmentDescription' => 'Treatment Description',
    ];

    public function index(Request $request): JsonResponse
    {
        $type = (string) ($request->query('reportType') ?: 'dashboard');

        if ($type === 'dashboard') {
            return $this->ok($this->dashboard($request));
        }

        if (! in_array($type, self::DETAIL_REPORT_TYPES, true)) {
            return response()->json([
                'success' => false,
                'error' => ['code' => 'INVALID_REPORT_TYPE', 'message' => 'Unknown reportType.'],
            ], 422);
        }

        [$includeSensitive, $denied] = $this->resolveSensitiveFlag($request, $type);
        if ($denied) {
            return $denied;
        }

        $report = $this->buildReport($type, $request, $includeSensitive);

        return $this->ok([
            'reportType' => $type,
            'columns' => $report['columns'],
            'rows' => $report['rows'],
            'meta' => ['count' => count($report['rows']), 'generatedAt' => now()->toIso8601String()],
        ]);
    }

    /**
     * `GET /reports/export` — CSV of one report's rows. Route middleware
     * requires `mediclaim.report.read` AND `mediclaim.report.export`
     * (two separate `permission:` middleware entries — each independently
     * enforced, so both must pass); `?includeSensitive=1` additionally
     * requires `mediclaim.report.reveal`, checked here since it is a
     * conditional/per-request elevation rather than a blanket route gate.
     */
    public function export(Request $request): StreamedResponse|JsonResponse
    {
        $type = (string) ($request->query('reportType') ?: 'claims');

        if (! in_array($type, self::DETAIL_REPORT_TYPES, true)) {
            return response()->json([
                'success' => false,
                'error' => ['code' => 'INVALID_REPORT_TYPE', 'message' => 'reportType must be one of: '.implode(', ', self::DETAIL_REPORT_TYPES)],
            ], 422);
        }

        [$includeSensitive, $denied] = $this->resolveSensitiveFlag($request, $type);
        if ($denied) {
            return $denied;
        }

        $report = $this->buildReport($type, $request, $includeSensitive);
        $actor = auth('api')->user();
        $companyCode = is_string($request->query('company_code')) ? $request->query('company_code') : null;

        MediclaimActivityLogSupport::log(
            $actor,
            'REPORT_EXPORTED',
            'mediclaim_report',
            null,
            null,
            ['reportType' => $type, 'includeSensitive' => $includeSensitive, 'rowCount' => count($report['rows'])],
            'Mediclaim report exported to CSV.',
            $companyCode
        );

        $columns = $report['columns'];
        $rows = $report['rows'];

        $callback = function () use ($columns, $rows) {
            $handle = fopen('php://output', 'w');
            // UTF-8 BOM so Excel doesn't mangle non-ASCII (employee names, etc).
            fwrite($handle, "\xEF\xBB\xBF");
            fputcsv($handle, array_values($columns));

            foreach ($rows as $row) {
                fputcsv($handle, array_map(
                    static fn ($key) => CsvSanitizer::sanitizeCell(
                        is_bool($row[$key] ?? null) ? (($row[$key]) ? 'Yes' : 'No') : (string) ($row[$key] ?? '')
                    ),
                    array_keys($columns)
                ));
            }

            fclose($handle);
        };

        return response()->streamDownload(
            $callback,
            'mediclaim-'.$type.'-'.now()->format('Ymd-His').'.csv',
            ['Content-Type' => 'text/csv; charset=UTF-8']
        );
    }

    // ------------------------------------------------------------ dashboard

    private function dashboard(Request $request): array
    {
        $claims = MediclaimClaim::query();
        $this->applyCompanyScope($claims, $request);

        if ($request->filled('from')) {
            $claims->whereDate('created_at', '>=', $request->query('from'));
        }

        if ($request->filled('to')) {
            $claims->whereDate('created_at', '<=', $request->query('to'));
        }

        $byStatus = (clone $claims)->select('status')->selectRaw('count(*) as total')->groupBy('status')->pluck('total', 'status');
        $pendingByStage = (clone $claims)->whereIn('status', self::PENDING_STATUSES)
            ->select('status')->selectRaw('count(*) as total')->groupBy('status')->pluck('total', 'status');

        $amounts = (clone $claims)->selectRaw(
            'coalesce(sum(total_claimed_amount),0) as requested, '.
            'coalesce(sum(total_approved_amount),0) as approved, '.
            'coalesce(sum(total_disallowed_amount),0) as disallowed'
        )->first();

        $settledTotal = MediclaimSettlement::query()
            ->whereHas('claim', fn ($q) => $this->applyCompanyScope($q, $request))
            ->sum('settled_amount');

        $hospitalUsage = (clone $claims)->whereNotNull('hospital_id')
            ->select('hospital_id')->selectRaw('count(*) as total')
            ->groupBy('hospital_id')
            ->with('hospital:id,name,city')
            ->orderByDesc('total')
            ->get();

        $enrollmentQuery = MediclaimEnrollment::query();
        $this->applyCompanyScope($enrollmentQuery, $request);
        $enrolledTotal = (clone $enrollmentQuery)->count();
        $enrolledActive = (clone $enrollmentQuery)->where('status', 'active')->count();

        $memberQuery = MediclaimMember::query()->whereHas('enrollment', fn ($q) => $this->applyCompanyScope($q, $request));
        $membersByRelationship = (clone $memberQuery)->where('status', 'active')
            ->select('relationship_type')->selectRaw('count(*) as total')
            ->groupBy('relationship_type')->pluck('total', 'relationship_type');

        $rejectionReasons = $this->rejectionReasonsReport($request)['rows'];
        $turnaroundRows = $this->turnaroundReport($request)['rows'];
        $decidedTurnarounds = array_values(array_filter(array_map(fn ($r) => $r['turnaroundDays'], $turnaroundRows), fn ($v) => $v !== null));
        $pendingOverdueRows = $this->pendingOverdueReport($request, 7)['rows'];
        $expiringPolicies = $this->expiringPoliciesReport($request, 30)['rows'];
        $expiringCards = $this->expiringCardsReport($request, 30)['rows'];
        $memberEligibilityExpiry = $this->memberEligibilityExpiryReport($request, 60)['rows'];

        return [
            'claimsByStatus' => $byStatus,
            'pendingByStage' => $pendingByStage,
            'amounts' => [
                'requested' => (float) ($amounts->requested ?? 0),
                'approved' => (float) ($amounts->approved ?? 0),
                'disallowed' => (float) ($amounts->disallowed ?? 0),
                'settled' => (float) $settledTotal,
            ],
            'hospitalUsage' => $hospitalUsage,
            'enrolledEmployees' => ['total' => $enrolledTotal, 'active' => $enrolledActive],
            'coveredMembers' => ['byRelationship' => $membersByRelationship, 'total' => (clone $memberQuery)->where('status', 'active')->count()],
            'rejectionDisallowanceReasonsTop' => array_slice($rejectionReasons, 0, 10),
            'turnaround' => [
                'decidedClaimCount' => count($decidedTurnarounds),
                'avgDays' => $decidedTurnarounds === [] ? null : round(array_sum($decidedTurnarounds) / count($decidedTurnarounds), 1),
            ],
            'pendingOverdue' => [
                'pendingCount' => count($pendingOverdueRows),
                'overdueCount' => count(array_filter($pendingOverdueRows, fn ($r) => $r['isOverdue'])),
            ],
            'expiringPoliciesCount' => count($expiringPolicies),
            'expiringCardsCount' => count($expiringCards),
            'memberEligibilityExpiryCount' => count($memberEligibilityExpiry),
        ];
    }

    // --------------------------------------------------------- report build

    private function buildReport(string $type, Request $request, bool $includeSensitive): array
    {
        return match ($type) {
            'enrolled_employees' => $this->enrolledEmployeesReport($request),
            'covered_members' => $this->coveredMembersReport($request),
            'claims' => $this->claimsReport($request, $includeSensitive),
            'amounts' => $this->amountsReport($request),
            'hospital_usage' => $this->hospitalUsageReport($request),
            'rejection_reasons' => $this->rejectionReasonsReport($request),
            'turnaround' => $this->turnaroundReport($request),
            'pending_overdue' => $this->pendingOverdueReport($request, (int) $request->query('overdueDays', 7)),
            'expiring_policies' => $this->expiringPoliciesReport($request, (int) $request->query('withinDays', 30)),
            'expiring_cards' => $this->expiringCardsReport($request, (int) $request->query('withinDays', 30)),
            'member_eligibility_expiry' => $this->memberEligibilityExpiryReport($request, (int) $request->query('withinDays', 60)),
            default => ['columns' => [], 'rows' => []],
        };
    }

    private function enrolledEmployeesReport(Request $request): array
    {
        $query = MediclaimEnrollment::query()->with(['employee:id,name,email,emp_code', 'policyVersion.policy']);
        $this->applyCompanyScope($query, $request);

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        $columns = [
            'empCode' => 'Employee Code', 'employeeName' => 'Employee Name', 'email' => 'Email',
            'companyCode' => 'Company', 'policyCode' => 'Policy Code', 'policyName' => 'Policy Name',
            'status' => 'Status', 'enrolledAt' => 'Enrolled At', 'terminatedAt' => 'Terminated At',
        ];

        $rows = $query->orderBy('id')->get()->map(fn (MediclaimEnrollment $e) => [
            'empCode' => $e->employee?->emp_code,
            'employeeName' => $e->employee?->name,
            'email' => $e->employee?->email,
            'companyCode' => $e->company_code,
            'policyCode' => $e->policyVersion?->policy?->policy_code,
            'policyName' => $e->policyVersion?->policy?->name,
            'status' => $e->status,
            'enrolledAt' => optional($e->enrolled_at)->toDateString(),
            'terminatedAt' => optional($e->terminated_at)->toDateString(),
        ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    private function coveredMembersReport(Request $request): array
    {
        $query = MediclaimMember::query()
            ->with(['employee:id,name,emp_code', 'enrollment:id,company_code'])
            ->whereHas('enrollment', fn ($q) => $this->applyCompanyScope($q, $request));

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        if ($request->filled('relationship_type')) {
            $query->whereIn('relationship_type', explode(',', (string) $request->query('relationship_type')));
        }

        $columns = [
            'employeeName' => 'Employee Name', 'empCode' => 'Employee Code', 'memberName' => 'Member Name',
            'relationshipType' => 'Relationship', 'dateOfBirth' => 'Date of Birth', 'gender' => 'Gender',
            'status' => 'Status', 'companyCode' => 'Company', 'effectiveFrom' => 'Effective From', 'effectiveTo' => 'Effective To',
        ];

        $rows = $query->orderBy('id')->get()->map(fn (MediclaimMember $m) => [
            'employeeName' => $m->employee?->name,
            'empCode' => $m->employee?->emp_code,
            'memberName' => $m->full_name,
            'relationshipType' => $m->relationship_type,
            'dateOfBirth' => optional($m->date_of_birth)->toDateString(),
            'gender' => $m->gender,
            'status' => $m->status,
            'companyCode' => $m->enrollment?->company_code,
            'effectiveFrom' => optional($m->effective_from)->toDateString(),
            'effectiveTo' => optional($m->effective_to)->toDateString(),
        ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    private function claimsReport(Request $request, bool $includeSensitive): array
    {
        $query = MediclaimClaim::query()->with(['employee:id,name,emp_code', 'hospital:id,name,city']);
        $this->applyCompanyScope($query, $request);

        if ($request->filled('status')) {
            $query->whereIn('status', explode(',', (string) $request->query('status')));
        }

        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->query('from'));
        }

        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->query('to'));
        }

        $columns = [
            'claimNumber' => 'Claim Number', 'empCode' => 'Employee Code', 'employeeName' => 'Employee Name',
            'companyCode' => 'Company', 'status' => 'Status', 'hospitalName' => 'Hospital',
            'treatmentType' => 'Treatment Type', 'admissionAt' => 'Admission Date', 'dischargeAt' => 'Discharge Date',
            'totalClaimedAmount' => 'Claimed Amount', 'totalApprovedAmount' => 'Approved Amount',
            'totalDisallowedAmount' => 'Disallowed Amount', 'submittedAt' => 'Submitted At',
            'settledAt' => 'Settled At', 'closedAt' => 'Closed At',
        ];

        if ($includeSensitive) {
            $columns = array_merge($columns, self::SENSITIVE_CLAIM_COLUMNS);
        }

        $rows = $query->orderByDesc('id')->limit(5000)->get()->map(function (MediclaimClaim $c) use ($includeSensitive) {
            $row = [
                'claimNumber' => $c->claim_number,
                'empCode' => $c->employee?->emp_code,
                'employeeName' => $c->employee?->name,
                'companyCode' => $c->company_code,
                'status' => $c->status,
                'hospitalName' => $c->hospital?->name,
                'treatmentType' => $c->treatment_type,
                'admissionAt' => optional($c->admission_at)->toDateString(),
                'dischargeAt' => optional($c->discharge_at)->toDateString(),
                'totalClaimedAmount' => (float) $c->total_claimed_amount,
                'totalApprovedAmount' => $c->total_approved_amount !== null ? (float) $c->total_approved_amount : null,
                'totalDisallowedAmount' => $c->total_disallowed_amount !== null ? (float) $c->total_disallowed_amount : null,
                'submittedAt' => optional($c->submitted_at)->toIso8601String(),
                'settledAt' => optional($c->settled_at)->toIso8601String(),
                'closedAt' => optional($c->closed_at)->toIso8601String(),
            ];

            if ($includeSensitive) {
                $row += [
                    'natureOfIllness' => $c->nature_of_illness,
                    'firstSymptomDate' => optional($c->first_symptom_date)->toDateString(),
                    'initialSymptoms' => is_array($c->initial_symptoms) ? implode('; ', $c->initial_symptoms) : $c->initial_symptoms,
                    'firstConsultationDate' => optional($c->first_consultation_date)->toDateString(),
                    'treatingDoctorName' => $c->treating_doctor_name,
                    'isMedicoLegalCase' => (bool) $c->is_medico_legal_case,
                    'reportedToPolice' => (bool) $c->reported_to_police,
                    'policeStationDetails' => $c->police_station_details,
                    'treatmentDescription' => $c->treatment_description,
                ];
            }

            return $row;
        })->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    private function amountsReport(Request $request): array
    {
        $query = MediclaimClaim::query();
        $this->applyCompanyScope($query, $request);

        $columns = [
            'status' => 'Status', 'claimCount' => 'Claim Count', 'requestedAmount' => 'Requested Amount',
            'approvedAmount' => 'Approved Amount', 'disallowedAmount' => 'Disallowed Amount',
        ];

        $rows = $query->select('status')
            ->selectRaw('count(*) as claim_count')
            ->selectRaw('coalesce(sum(total_claimed_amount),0) as requested')
            ->selectRaw('coalesce(sum(total_approved_amount),0) as approved')
            ->selectRaw('coalesce(sum(total_disallowed_amount),0) as disallowed')
            ->groupBy('status')
            ->orderBy('status')
            ->get()
            ->map(fn ($r) => [
                'status' => $r->status,
                'claimCount' => (int) $r->claim_count,
                'requestedAmount' => (float) $r->requested,
                'approvedAmount' => (float) $r->approved,
                'disallowedAmount' => (float) $r->disallowed,
            ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    private function hospitalUsageReport(Request $request): array
    {
        $query = MediclaimClaim::query()->whereNotNull('hospital_id');
        $this->applyCompanyScope($query, $request);

        $columns = [
            'hospitalName' => 'Hospital', 'city' => 'City', 'claimCount' => 'Claim Count',
            'totalClaimedAmount' => 'Claimed Amount', 'totalApprovedAmount' => 'Approved Amount',
            'totalDisallowedAmount' => 'Disallowed Amount',
        ];

        $rows = $query->select('hospital_id')
            ->selectRaw('count(*) as claim_count')
            ->selectRaw('coalesce(sum(total_claimed_amount),0) as requested')
            ->selectRaw('coalesce(sum(total_approved_amount),0) as approved')
            ->selectRaw('coalesce(sum(total_disallowed_amount),0) as disallowed')
            ->groupBy('hospital_id')
            ->with('hospital:id,name,city')
            ->orderByDesc('claim_count')
            ->get()
            ->map(fn ($r) => [
                'hospitalName' => $r->hospital?->name,
                'city' => $r->hospital?->city,
                'claimCount' => (int) $r->claim_count,
                'totalClaimedAmount' => (float) $r->requested,
                'totalApprovedAmount' => (float) $r->approved,
                'totalDisallowedAmount' => (float) $r->disallowed,
            ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /**
     * Combines expense-level disallowance reasons (`mediclaim_claim_expenses
     * .disallowed_reason`, financial/documentation reasons — e.g. "receipt
     * missing", "exceeds category cap") with claim-level rejection/return
     * remarks (`mediclaim_claim_decisions.remarks` where the decision was
     * rejected/not_recommended/returned) into one normalized row set. Never
     * includes diagnosis — these are workflow/financial reasons, not medical
     * detail, so this report type is not gated behind `.reveal`.
     */
    private function rejectionReasonsReport(Request $request): array
    {
        $columns = [
            'source' => 'Source', 'claimNumber' => 'Claim Number', 'stageOrCategory' => 'Stage / Category',
            'reason' => 'Reason', 'amount' => 'Amount', 'date' => 'Date',
        ];

        $expenseRows = MediclaimClaimExpense::query()
            ->whereNotNull('disallowed_reason')
            ->where('disallowed_reason', '!=', '')
            ->whereHas('claim', fn ($q) => $this->applyCompanyScope($q, $request))
            ->with('claim:id,claim_number')
            ->get()
            ->map(fn (MediclaimClaimExpense $e) => [
                'source' => 'expense_disallowance',
                'claimNumber' => $e->claim?->claim_number,
                'stageOrCategory' => $e->category,
                'reason' => $e->disallowed_reason,
                'amount' => $e->disallowed_amount !== null ? (float) $e->disallowed_amount : null,
                'date' => optional($e->expense_date)->toDateString(),
            ]);

        $decisionRows = MediclaimClaimDecision::query()
            ->whereIn('decision', ['rejected', 'not_recommended', 'returned'])
            ->whereHas('claim', fn ($q) => $this->applyCompanyScope($q, $request))
            ->with('claim:id,claim_number')
            ->get()
            ->map(fn (MediclaimClaimDecision $d) => [
                'source' => 'claim_decision',
                'claimNumber' => $d->claim?->claim_number,
                'stageOrCategory' => $d->stage,
                'reason' => $d->remarks,
                'amount' => null,
                'date' => optional($d->decided_at)->toDateString(),
            ]);

        $rows = $expenseRows->concat($decisionRows)->sortByDesc('date')->values()->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /**
     * Approval turnaround per submitted claim: days from `submitted_at` to
     * the reference end (closed_at, else settled_at, else the latest
     * recorded decision) — `turnaroundDays` is null while still in
     * progress, in which case `daysElapsed` (submitted_at to now) is
     * reported instead so an in-flight claim's age is still visible.
     */
    private function turnaroundReport(Request $request): array
    {
        $query = MediclaimClaim::query()->whereNotNull('submitted_at')->with('employee:id,name,emp_code');
        $this->applyCompanyScope($query, $request);

        $columns = [
            'claimNumber' => 'Claim Number', 'employeeName' => 'Employee Name', 'status' => 'Status',
            'submittedAt' => 'Submitted At', 'referenceEndAt' => 'Reference End', 'turnaroundDays' => 'Turnaround (Days)',
            'daysElapsed' => 'Days Elapsed (in progress)',
        ];

        $rows = $query->orderByDesc('submitted_at')->limit(5000)->get()->map(function (MediclaimClaim $c) {
            $submittedAt = Carbon::parse($c->submitted_at);
            $lastDecisionAt = $c->decisions()->max('decided_at');
            $referenceEnd = $c->closed_at ?? $c->settled_at ?? $lastDecisionAt;

            $turnaroundDays = null;
            $daysElapsed = null;

            if ($referenceEnd !== null) {
                $turnaroundDays = $submittedAt->diffInDays(Carbon::parse($referenceEnd));
            } else {
                $daysElapsed = $submittedAt->diffInDays(now());
            }

            return [
                'claimNumber' => $c->claim_number,
                'employeeName' => $c->employee?->name,
                'status' => $c->status,
                'submittedAt' => $submittedAt->toIso8601String(),
                'referenceEndAt' => $referenceEnd ? Carbon::parse($referenceEnd)->toIso8601String() : null,
                'turnaroundDays' => $turnaroundDays,
                'daysElapsed' => $daysElapsed,
            ];
        })->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /**
     * Claims currently sitting at any of the five mid-workflow stages,
     * flagged overdue once they've been at their CURRENT status longer than
     * `$overdueDays` — "entered current stage at" is read from the latest
     * `mediclaim_claim_events` row whose `to_status` matches, falling back
     * to `submitted_at`/`updated_at` when no such event exists.
     */
    private function pendingOverdueReport(Request $request, int $overdueDays): array
    {
        $query = MediclaimClaim::query()->whereIn('status', self::PENDING_STATUSES)->with('employee:id,name,emp_code');
        $this->applyCompanyScope($query, $request);

        $columns = [
            'claimNumber' => 'Claim Number', 'employeeName' => 'Employee Name', 'status' => 'Status',
            'enteredStageAt' => 'Entered Current Stage', 'daysPending' => 'Days Pending', 'isOverdue' => 'Overdue',
        ];

        $rows = $query->orderBy('id')->get()->map(function (MediclaimClaim $c) use ($overdueDays) {
            $enteredAt = $c->events()->where('to_status', $c->status)->max('created_at')
                ?? $c->submitted_at
                ?? $c->updated_at;
            $enteredAt = Carbon::parse($enteredAt);
            $daysPending = $enteredAt->diffInDays(now());

            return [
                'claimNumber' => $c->claim_number,
                'employeeName' => $c->employee?->name,
                'status' => $c->status,
                'enteredStageAt' => $enteredAt->toIso8601String(),
                'daysPending' => $daysPending,
                'isOverdue' => $daysPending > $overdueDays,
            ];
        })->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    private function expiringPoliciesReport(Request $request, int $withinDays): array
    {
        $today = now()->startOfDay();
        $horizon = $today->copy()->addDays(max(0, $withinDays));

        $query = MediclaimPolicyVersion::query()
            ->where('status', 'active')
            ->whereNotNull('effective_to')
            ->whereBetween('effective_to', [$today->toDateString(), $horizon->toDateString()])
            ->whereHas('policy', fn ($q) => $this->applyCompanyScope($q, $request))
            ->with('policy:id,policy_code,name,company_code');

        $columns = [
            'policyCode' => 'Policy Code', 'policyName' => 'Policy Name', 'companyCode' => 'Company',
            'versionNumber' => 'Version', 'effectiveTo' => 'Effective To', 'daysRemaining' => 'Days Remaining',
        ];

        $rows = $query->orderBy('effective_to')->get()->map(function (MediclaimPolicyVersion $v) use ($today) {
            $effectiveTo = Carbon::parse($v->effective_to)->startOfDay();

            return [
                'policyCode' => $v->policy?->policy_code,
                'policyName' => $v->policy?->name,
                'companyCode' => $v->policy?->company_code,
                'versionNumber' => $v->version_number,
                'effectiveTo' => $effectiveTo->toDateString(),
                'daysRemaining' => $today->diffInDays($effectiveTo),
            ];
        })->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    private function expiringCardsReport(Request $request, int $withinDays): array
    {
        $today = now()->startOfDay();
        $horizon = $today->copy()->addDays(max(0, $withinDays));

        $query = MediclaimCard::query()
            ->where('status', 'active')
            ->whereNotNull('valid_to')
            ->whereBetween('valid_to', [$today->toDateString(), $horizon->toDateString()])
            ->whereHas('enrollment', fn ($q) => $this->applyCompanyScope($q, $request))
            ->with(['member:id,full_name,employee_user_id', 'member.employee:id,name,emp_code', 'enrollment:id,company_code']);

        $columns = [
            'cardNumber' => 'Card Number', 'memberName' => 'Member Name', 'employeeName' => 'Employee Name',
            'companyCode' => 'Company', 'validTo' => 'Valid To', 'daysRemaining' => 'Days Remaining',
        ];

        $rows = $query->orderBy('valid_to')->get()->map(function (MediclaimCard $card) use ($today) {
            $validTo = Carbon::parse($card->valid_to)->startOfDay();

            return [
                'cardNumber' => $card->card_number,
                'memberName' => $card->member?->full_name,
                'employeeName' => $card->member?->employee?->name,
                'companyCode' => $card->enrollment?->company_code,
                'validTo' => $validTo->toDateString(),
                'daysRemaining' => $today->diffInDays($validTo),
            ];
        })->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /**
     * Members approaching (or past) an age-based eligibility cutoff —
     * `child_max_age_years`/`parent_max_age_years` from the member's
     * enrollment's policy version `rules` JSON, the exact same rule keys
     * `PolicyEligibilityService::validateMemberEligibility()` reads, so this
     * report's notion of "expiring" never drifts from what actually gates a
     * claim. Also includes members with an explicit `effective_to` inside
     * the window (an administrative coverage end unrelated to age).
     */
    private function memberEligibilityExpiryReport(Request $request, int $withinDays): array
    {
        $today = now()->startOfDay();
        $horizon = $today->copy()->addDays(max(0, $withinDays));

        $query = MediclaimMember::query()
            ->where('status', 'active')
            ->whereHas('enrollment', fn ($q) => $this->applyCompanyScope($q, $request))
            ->with(['employee:id,name,emp_code', 'enrollment.policyVersion', 'enrollment:id,company_code,policy_version_id']);

        $columns = [
            'employeeName' => 'Employee Name', 'empCode' => 'Employee Code', 'memberName' => 'Member Name',
            'relationshipType' => 'Relationship', 'companyCode' => 'Company', 'reason' => 'Reason',
            'expiryDate' => 'Expiry Date', 'status' => 'Status',
        ];

        $rows = [];

        foreach ($query->get() as $member) {
            /** @var MediclaimMember $member */
            $rules = $member->enrollment?->policyVersion?->rules ?? [];
            $companyCode = $member->enrollment?->company_code;

            if (in_array($member->relationship_type, ['child', 'parent'], true) && $member->date_of_birth) {
                $maxAgeKey = $member->relationship_type === 'child' ? 'child_max_age_years' : 'parent_max_age_years';
                $maxAge = $rules[$maxAgeKey] ?? null;

                if ($maxAge !== null) {
                    $cutoff = Carbon::parse($member->date_of_birth)->addYears((int) $maxAge + 1)->startOfDay();

                    if ($cutoff->lessThanOrEqualTo($horizon)) {
                        $rows[] = [
                            'employeeName' => $member->employee?->name,
                            'empCode' => $member->employee?->emp_code,
                            'memberName' => $member->full_name,
                            'relationshipType' => $member->relationship_type,
                            'companyCode' => $companyCode,
                            'reason' => "Exceeds policy's max covered age ({$maxAge} years) for a {$member->relationship_type}",
                            'expiryDate' => $cutoff->toDateString(),
                            'status' => $cutoff->lessThan($today) ? 'overdue' : 'expiring',
                        ];
                    }
                }
            }

            if ($member->effective_to) {
                $effectiveTo = Carbon::parse($member->effective_to)->startOfDay();

                if ($effectiveTo->greaterThanOrEqualTo($today) && $effectiveTo->lessThanOrEqualTo($horizon)) {
                    $rows[] = [
                        'employeeName' => $member->employee?->name,
                        'empCode' => $member->employee?->emp_code,
                        'memberName' => $member->full_name,
                        'relationshipType' => $member->relationship_type,
                        'companyCode' => $companyCode,
                        'reason' => 'Coverage effective-to date reached',
                        'expiryDate' => $effectiveTo->toDateString(),
                        'status' => 'expiring',
                    ];
                }
            }
        }

        usort($rows, fn ($a, $b) => $a['expiryDate'] <=> $b['expiryDate']);

        return ['columns' => $columns, 'rows' => $rows];
    }

    // -------------------------------------------------------- reveal gating

    /**
     * `?includeSensitive=1` is only meaningful for the `claims` report
     * (the only one carrying Section C/D medical-history columns). Reading
     * it requires holding `mediclaim.report.reveal`, checked in-code via
     * `AuthorizationEngine` (the same mechanism `SalariesSlipController`
     * uses for a conditional, non-route-level permission check) rather than
     * a blanket route gate, since most report requests never ask for it.
     * Silently omitting the flag would also be an acceptable, equally-safe
     * choice per the task's own framing — this implementation chooses to
     * reject explicitly (403) instead, so a caller who mistakenly believes
     * they are viewing full detail is never given a silently-trimmed report.
     *
     * @return array{0: bool, 1: ?JsonResponse} [includeSensitive, denialResponseOrNull]
     */
    private function resolveSensitiveFlag(Request $request, string $type): array
    {
        if (! $request->boolean('includeSensitive') || $type !== 'claims') {
            return [false, null];
        }

        $actor = auth('api')->user();
        $allowed = $actor && (
            $actor->isSuperAdmin()
            || app(AuthorizationEngine::class)->decide($actor, 'mediclaim.report.reveal', [], ['audit' => false])->allowed
        );

        if (! $allowed) {
            return [false, response()->json([
                'success' => false,
                'error' => [
                    'code' => 'FORBIDDEN',
                    'message' => 'You are not permitted to view sensitive medical detail in Mediclaim reports.',
                ],
            ], 403)];
        }

        return [true, null];
    }
}
