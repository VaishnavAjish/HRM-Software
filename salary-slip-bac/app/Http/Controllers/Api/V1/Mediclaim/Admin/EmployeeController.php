<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Admin;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Http\Controllers\Api\V1\Mediclaim\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\Mediclaim\MediclaimCard;
use App\Models\Mediclaim\MediclaimEnrollment;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimMemberChangeRequest;
use App\Models\User;
use App\Services\Mediclaim\MediclaimMemberService;
use App\Services\Mediclaim\PolicyEligibilityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * `GET /admin/employees`, `GET /admin/employees/{employee}` — company-wide
 * Mediclaim status across every active employee, not only the ones who
 * already happen to have an `mediclaim_enrollments` row (unlike
 * `Admin\EnrollmentController`, which only ever lists enrollments that
 * already exist). Since enrollment is now provisioned lazily the first time
 * an eligible employee touches the self-service module
 * (`PolicyEligibilityService::resolveOrCreateEnrollment()`), most eligible
 * employees have no enrollment yet the first time HR looks at this screen —
 * this controller starts from the `users` table itself (same base "real,
 * active employee" filter `UserController::index()` uses) and computes each
 * employee's Mediclaim status on top, so nobody is invisible just because
 * they haven't opened the module yet.
 *
 * Status is one of three values, computed the same way in both index() and
 * show():
 *   - `not_eligible` — hasn't cleared the joining waiting period yet.
 *   - `pending` — eligible, but has not finished the onboarding gate yet
 *     (acknowledge the rule book, then add family member details — see
 *     `MyCoverageController::acknowledgeRuleBook()`/`completeOnboarding()`).
 *   - `completed` — eligible and `mediclaim_enrollments.onboarding_completed_at`
 *     is set. This is deliberately NOT "has an active card": a card is
 *     auto-issued the moment anyone opens the module (or via bulkIssue()
 *     below), so using card-issuance as the signal made nearly every
 *     eligible employee show as Completed the instant they merely visited
 *     the tab, long before actually reading the rule book or entering
 *     family details. Enrollments that predate the onboarding gate feature
 *     were backfilled with `onboarding_completed_at = created_at` (see
 *     migration `2026_09_15_000036_...`) so legacy employees are never
 *     retroactively locked out — those correctly show as Completed here
 *     too, since they were never gated in the first place.
 *
 * `bulkIssue()` (`POST /admin/employees/bulk-issue-cards`) provisions
 * enrollment + the employee's own card for every eligible employee
 * company-wide immediately, rather than waiting for each one to individually
 * open the module — every employee gets their ₹3,00,000 floater as soon as
 * they're eligible, with no per-employee HR action required. This is
 * independent of onboarding-gate completion: a bulk-issued card does not by
 * itself mark `mediclaimStatus` as `completed`.
 */
class EmployeeController extends Controller
{
    use ScopesCompany;
    use RespondsWithEnvelope;

    public function __construct(
        private readonly PolicyEligibilityService $eligibility,
        private readonly MediclaimMemberService $members,
    ) {
    }

    public function index(Request $request): JsonResponse
    {
        $query = $this->baseEmployeeQuery($request);

        if ($request->filled('search')) {
            $search = (string) $request->query('search');
            $query->where(function ($q) use ($search) {
                $q->where('name', 'like', "%{$search}%")
                    ->orWhere('emp_code', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        // mediclaimStatus is computed, not a DB column, so it cannot be
        // pushed into a WHERE clause — every status filter (Pending /
        // Completed / Not Eligible) is applied here, in memory, BEFORE
        // pagination. Filtering after a DB-level paginate() would report a
        // `total` (and therefore a page count) that never actually shrinks
        // when a status filter is applied, since that total would still
        // reflect every employee rather than just the ones matching the
        // filter — exactly the "same huge page count no matter which tab is
        // selected" bug this was written to avoid. Company-scoped active
        // employees top out in the low thousands for this app, so computing
        // status for the whole set (still just a handful of fixed-size
        // batched queries via withMediclaimStatus(), never N+1) and paging
        // the resulting collection is the correct trade-off here.
        $allEmployees = $query->orderBy('name')->get();
        $departments = $allEmployees->pluck('department')->filter()->unique()->sort()->values();
        $rows = $this->withMediclaimStatus($allEmployees);

        if ($request->filled('department')) {
            $wantedDepartment = (string) $request->query('department');
            $rows = $rows->filter(fn (array $row) => $row['department'] === $wantedDepartment)->values();
        }

        // Counted after search/department but before the status filter
        // itself, so each status tab's count reflects every other active
        // filter while staying stable as the user switches between tabs —
        // the same "live counts on the tab itself" UX as EmployeeMasterTable's
        // stageCounts.
        $statusCounts = [
            'all' => $rows->count(),
            'not_eligible' => $rows->where('mediclaimStatus', 'not_eligible')->count(),
            'pending' => $rows->where('mediclaimStatus', 'pending')->count(),
            'completed' => $rows->where('mediclaimStatus', 'completed')->count(),
        ];

        if ($request->filled('status')) {
            $wanted = explode(',', (string) $request->query('status'));
            $rows = $rows->filter(fn (array $row) => in_array($row['mediclaimStatus'], $wanted, true))->values();
        }

        $perPage = min((int) $request->query('per_page', 25), 200);
        $page = max((int) $request->query('page', 1), 1);
        $total = $rows->count();
        $pageItems = $rows->forPage($page, $perPage)->values();

        return $this->ok([
            'data' => $pageItems,
            'total' => $total,
            'current_page' => $page,
            'per_page' => $perPage,
            'departments' => $departments,
            'statusCounts' => $statusCounts,
        ]);
    }

    public function show(Request $request, int $employee): JsonResponse
    {
        $user = $this->baseEmployeeQuery($request)->where('id', $employee)->first();

        if (! $user) {
            return $this->missing('Employee not found.');
        }

        $row = $this->withMediclaimStatus(collect([$user]))->first();

        $enrollment = MediclaimEnrollment::query()
            ->where('employee_user_id', $employee)
            ->where('status', 'active')
            ->with(['policyVersion.policy'])
            ->latest('id')
            ->first();

        $members = MediclaimMember::query()
            ->where('employee_user_id', $employee)
            ->whereIn('status', ['active', 'inactive'])
            ->orderByRaw("CASE relationship_type WHEN 'self' THEN 0 WHEN 'spouse' THEN 1 WHEN 'child' THEN 2 ELSE 3 END")
            ->orderBy('full_name')
            ->get();

        $cards = $members->isEmpty()
            ? collect()
            : MediclaimCard::query()->whereIn('member_id', $members->pluck('id'))->orderByDesc('id')->get();

        $changeRequests = MediclaimMemberChangeRequest::query()
            ->where('employee_user_id', $employee)
            ->with('member')
            ->orderByDesc('id')
            ->limit(50)
            ->get();

        return $this->ok([
            'employee' => $row,
            'enrollment' => $enrollment,
            'members' => $members,
            'cards' => $cards,
            'changeRequests' => $changeRequests,
        ]);
    }

    /**
     * Provisions every eligible, company-scoped employee's Mediclaim
     * coverage (enrollment + their own "self" card) right now, in one pass
     * — the bulk counterpart to `MyCoverageController::show()`'s
     * per-employee, visit-triggered call to the same underlying
     * `ensureSelfCoverageIssued()`. Safe to run repeatedly: employees who
     * are already provisioned, or who haven't cleared the waiting period
     * yet, are cheap no-ops.
     */
    public function bulkIssue(Request $request): JsonResponse
    {
        $employees = $this->baseEmployeeQuery($request)->get();

        $summary = ['processed' => 0, 'issued' => 0, 'alreadyIssued' => 0, 'notEligible' => 0, 'failed' => 0];

        foreach ($employees as $employee) {
            $summary['processed']++;

            switch ($this->members->ensureSelfCoverageIssued($employee)) {
                case 'issued':
                    $summary['issued']++;
                    break;
                case 'already_issued':
                    $summary['alreadyIssued']++;
                    break;
                case 'not_eligible':
                    $summary['notEligible']++;
                    break;
                case 'card_failed':
                    $summary['failed']++;
                    break;
            }
        }

        return $this->ok($summary);
    }

    /** Mirrors `UserController::index()`'s "real, active employee" base filter. */
    private function baseEmployeeQuery(Request $request)
    {
        $query = User::query()
            ->where('is_deleted', 0)
            ->whereNotIn('role', [0, 1, 2])
            ->whereNotNull('emp_code')
            ->where('emp_code', '!=', '')
            ->where('status', 0)
            ->where(function ($q) {
                $q->whereNull('type')->orWhereNotIn('type', ['appointment', 'agent', 'pending_employee']);
            })
            ->select(['id', 'name', 'email', 'emp_code', 'company_code', 'unit', 'department', 'designation', 'joining_date', 'dob', 'gender', 'mobile_number']);

        $this->applyCompanyScope($query, $request);

        return $query;
    }

    /**
     * Batch-resolves eligibility + onboarding-gate completion for a page of
     * employees in a fixed number of queries (never N+1 — one query per
     * lookup table regardless of page size).
     *
     * @return Collection<int, array>
     */
    private function withMediclaimStatus(Collection $users): Collection
    {
        $ids = $users->pluck('id')->all();

        $enrollments = MediclaimEnrollment::query()
            ->whereIn('employee_user_id', $ids)
            ->where('status', 'active')
            ->with('policyVersion.policy')
            ->get()
            ->keyBy('employee_user_id');

        $memberCounts = MediclaimMember::query()
            ->whereIn('employee_user_id', $ids)
            ->where('status', 'active')
            ->selectRaw('employee_user_id, count(*) as cnt')
            ->groupBy('employee_user_id')
            ->pluck('cnt', 'employee_user_id');

        return $users->map(function (User $user) use ($enrollments, $memberCounts) {
            $eligibility = $this->eligibility->waitingPeriodStatus($user);
            $onboardingCompleted = (bool) $enrollments->get($user->id)?->onboarding_completed_at;

            $status = ! $eligibility['eligible']
                ? 'not_eligible'
                : ($onboardingCompleted ? 'completed' : 'pending');

            return [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'empCode' => $user->emp_code,
                'companyCode' => $user->company_code,
                'unit' => $user->unit,
                'department' => $user->department,
                'designation' => $user->designation,
                'joiningDate' => optional($user->joining_date)->toDateString() ?? $user->joining_date,
                'dob' => optional($user->dob)->toDateString() ?? $user->dob,
                'gender' => $user->gender,
                'mobileNumber' => $user->mobile_number,
                'eligibility' => $eligibility,
                'enrollment' => $enrollments->get($user->id),
                'activeMembersCount' => (int) ($memberCounts->get($user->id) ?? 0),
                'mediclaimStatus' => $status,
            ];
        });
    }
}
