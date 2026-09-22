<?php

namespace App\Services\Attendance;

use App\Models\AttendanceDaily;
use App\Models\AttendanceRegularization;
use App\Models\AttendanceSyncLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Attendance Engine Rebuild — Phase 5 (spec §71 item — "12 report types").
 *
 * Every method returns `['columns' => [key => label], 'rows' => [assoc, ...]]`,
 * the exact shape `AttendanceReportController` needs for both the JSON
 * preview and the CSV/PDF export — mirrors
 * `Mediclaim\Admin\ReportController::buildReport()`'s own convention so a
 * developer who already knows that controller can read this one immediately.
 *
 * Every report reads ONLY from the calculated layer (`attendance_daily`,
 * `attendance_regularizations`, `attendance_sync_logs`) — never recomputes,
 * matching the rest of the read API (spec §42).
 */
class AttendanceReportService
{
    public const TYPES = [
        'daily', 'monthly_summary', 'late_comers', 'early_leavers', 'absentees',
        'overtime', 'missing_punch', 'regularizations', 'leave_vs_attendance',
        'department_summary', 'employee_register', 'reconciliation',
    ];

    public function build(string $type, Request $request): array
    {
        return match ($type) {
            'daily' => $this->dailyReport($request),
            'monthly_summary' => $this->monthlySummaryReport($request),
            'late_comers' => $this->lateComersReport($request),
            'early_leavers' => $this->earlyLeaversReport($request),
            'absentees' => $this->absenteesReport($request),
            'overtime' => $this->overtimeReport($request),
            'missing_punch' => $this->missingPunchReport($request),
            'regularizations' => $this->regularizationsReport($request),
            'leave_vs_attendance' => $this->leaveVsAttendanceReport($request),
            'department_summary' => $this->departmentSummaryReport($request),
            'employee_register' => $this->employeeRegisterReport($request),
            'reconciliation' => $this->reconciliationReport($request),
            default => ['columns' => [], 'rows' => []],
        };
    }

    // ------------------------------------------------------------ helpers

    private function dateRange(Request $request): array
    {
        $from = $request->filled('date_from') ? Carbon::parse($request->query('date_from')) : Carbon::parse($request->query('date', now()->toDateString()));
        $to = $request->filled('date_to') ? Carbon::parse($request->query('date_to')) : $from->copy();

        return [$from->startOfDay(), $to->endOfDay()];
    }

    private function scopedDailyQuery(Request $request)
    {
        [$from, $to] = $this->dateRange($request);
        $query = AttendanceDaily::query()
            ->with('user:id,name,emp_code,department,unit,company_code')
            // whereDate (not whereBetween on the raw string) so this is
            // correct regardless of how a given driver physically stores a
            // `date` column's value — SQLite keeps whatever string Eloquent
            // sends verbatim (a full "Y-m-d H:i:s" by default, since
            // Grammar::getDateFormat() isn't cast-type-specific), so a plain
            // whereBetween(['Y-m-d','Y-m-d']) string-compares below the true
            // range on SQLite even though it's fine on Postgres (whose real
            // `date` column type truncates time on write). whereDate() wraps
            // both sides in the grammar's own DATE() extraction, so it's
            // correct on every driver.
            ->whereDate('attendance_date', '>=', $from->toDateString())
            ->whereDate('attendance_date', '<=', $to->toDateString());

        if ($request->filled('company_code')) {
            $query->where('company_code', $request->query('company_code'));
        }
        if ($request->filled('unit')) {
            $query->where('unit', $request->query('unit'));
        }
        if ($request->filled('department')) {
            $query->where('department', $request->query('department'));
        }
        if ($request->filled('employee_id')) {
            $query->where('user_id', (int) $request->query('employee_id'));
        }

        return $query;
    }

    private function minutesToHours(?int $minutes): ?float
    {
        return $minutes === null ? null : round($minutes / 60, 2);
    }

    // ------------------------------------------------------------ reports

    /** Report 1: one calendar date, every employee's calculated status (spec §36-ish "daily report"). */
    private function dailyReport(Request $request): array
    {
        $columns = [
            'date' => 'Date', 'empCode' => 'Employee Code', 'name' => 'Employee Name',
            'department' => 'Department', 'unit' => 'Unit', 'status' => 'Status',
            'firstPunch' => 'First Punch', 'lastPunch' => 'Last Punch', 'workedHours' => 'Worked Hours',
            'isLate' => 'Late', 'isEarlyExit' => 'Early Exit', 'isOvertime' => 'Overtime',
        ];

        $rows = $this->scopedDailyQuery($request)->orderBy('user_id')->get()->map(fn (AttendanceDaily $d) => [
            'date' => $d->attendance_date->toDateString(),
            'empCode' => $d->user?->emp_code ?? $d->emp_code_raw,
            'name' => $d->user?->name,
            'department' => $d->department,
            'unit' => $d->unit,
            'status' => $d->primary_status,
            'firstPunch' => optional($d->first_punch_at)->format('H:i'),
            'lastPunch' => optional($d->last_punch_at)->format('H:i'),
            'workedHours' => $this->minutesToHours($d->worked_minutes),
            'isLate' => $d->is_late,
            'isEarlyExit' => $d->is_early_exit,
            'isOvertime' => $d->is_overtime,
        ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /** Report 2: per-employee totals across the range (spec §34/§71). */
    private function monthlySummaryReport(Request $request): array
    {
        $columns = [
            'empCode' => 'Employee Code', 'name' => 'Employee Name', 'department' => 'Department', 'unit' => 'Unit',
            'present' => 'Present', 'absent' => 'Absent', 'halfDay' => 'Half Day', 'onLeave' => 'On Leave',
            'weeklyOff' => 'Weekly Off', 'holiday' => 'Holiday', 'lateCount' => 'Late Count',
            'earlyExitCount' => 'Early Exit Count', 'overtimeHours' => 'Overtime Hours', 'workedHours' => 'Worked Hours',
            'attendancePercent' => 'Attendance %',
        ];

        $rows = $this->scopedDailyQuery($request)->get()->groupBy('user_id')->map(function ($days) {
            $first = $days->first();
            $totalDays = $days->count();
            // Denominator: total calculated days minus weekly-off/holiday days the
            // employee was never expected to attend — explicit, not implicit
            // (spec's own "explicit denominators" requirement).
            $expectedDays = $days->whereNotIn('primary_status', [AttendanceDaily::STATUS_WEEKLY_OFF, AttendanceDaily::STATUS_HOLIDAY])->count();
            $presentLike = $days->whereIn('primary_status', [AttendanceDaily::STATUS_PRESENT, AttendanceDaily::STATUS_HALF_DAY, AttendanceDaily::STATUS_HOLIDAY_WORKED, AttendanceDaily::STATUS_ON_LEAVE])->count();

            return [
                'empCode' => $first->user?->emp_code ?? $first->emp_code_raw,
                'name' => $first->user?->name,
                'department' => $first->department,
                'unit' => $first->unit,
                'present' => $days->whereIn('primary_status', [AttendanceDaily::STATUS_PRESENT, AttendanceDaily::STATUS_HOLIDAY_WORKED])->count(),
                'absent' => $days->where('primary_status', AttendanceDaily::STATUS_ABSENT)->count(),
                'halfDay' => $days->where('primary_status', AttendanceDaily::STATUS_HALF_DAY)->count(),
                'onLeave' => $days->where('primary_status', AttendanceDaily::STATUS_ON_LEAVE)->count(),
                'weeklyOff' => $days->where('primary_status', AttendanceDaily::STATUS_WEEKLY_OFF)->count(),
                'holiday' => $days->whereIn('primary_status', [AttendanceDaily::STATUS_HOLIDAY, AttendanceDaily::STATUS_HOLIDAY_WORKED])->count(),
                'lateCount' => $days->where('is_late', true)->count(),
                'earlyExitCount' => $days->where('is_early_exit', true)->count(),
                'overtimeHours' => $this->minutesToHours((int) $days->sum('overtime_minutes')),
                'workedHours' => $this->minutesToHours((int) $days->sum('worked_minutes')),
                'attendancePercent' => $expectedDays > 0 ? round(($presentLike / $expectedDays) * 100, 1) : null,
                '_totalDays' => $totalDays,
            ];
        })->values()->map(function ($row) {
            unset($row['_totalDays']);

            return $row;
        })->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /** Report 3. */
    private function lateComersReport(Request $request): array
    {
        $columns = [
            'date' => 'Date', 'empCode' => 'Employee Code', 'name' => 'Employee Name', 'department' => 'Department',
            'firstPunch' => 'First Punch', 'lateMinutes' => 'Late Minutes',
        ];

        $rows = $this->scopedDailyQuery($request)->where('is_late', true)->orderBy('attendance_date')->get()
            ->map(fn (AttendanceDaily $d) => [
                'date' => $d->attendance_date->toDateString(),
                'empCode' => $d->user?->emp_code ?? $d->emp_code_raw,
                'name' => $d->user?->name,
                'department' => $d->department,
                'firstPunch' => optional($d->first_punch_at)->format('H:i'),
                'lateMinutes' => $d->late_minutes,
            ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /** Report 4. */
    private function earlyLeaversReport(Request $request): array
    {
        $columns = [
            'date' => 'Date', 'empCode' => 'Employee Code', 'name' => 'Employee Name', 'department' => 'Department',
            'lastPunch' => 'Last Punch', 'earlyExitMinutes' => 'Early Exit Minutes',
        ];

        $rows = $this->scopedDailyQuery($request)->where('is_early_exit', true)->orderBy('attendance_date')->get()
            ->map(fn (AttendanceDaily $d) => [
                'date' => $d->attendance_date->toDateString(),
                'empCode' => $d->user?->emp_code ?? $d->emp_code_raw,
                'name' => $d->user?->name,
                'department' => $d->department,
                'lastPunch' => optional($d->last_punch_at)->format('H:i'),
                'earlyExitMinutes' => $d->early_exit_minutes,
            ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /** Report 5. */
    private function absenteesReport(Request $request): array
    {
        $columns = [
            'date' => 'Date', 'empCode' => 'Employee Code', 'name' => 'Employee Name',
            'department' => 'Department', 'unit' => 'Unit',
        ];

        $rows = $this->scopedDailyQuery($request)->where('primary_status', AttendanceDaily::STATUS_ABSENT)->orderBy('attendance_date')->get()
            ->map(fn (AttendanceDaily $d) => [
                'date' => $d->attendance_date->toDateString(),
                'empCode' => $d->user?->emp_code ?? $d->emp_code_raw,
                'name' => $d->user?->name,
                'department' => $d->department,
                'unit' => $d->unit,
            ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /** Report 6. */
    private function overtimeReport(Request $request): array
    {
        $columns = [
            'date' => 'Date', 'empCode' => 'Employee Code', 'name' => 'Employee Name', 'department' => 'Department',
            'workedHours' => 'Worked Hours', 'overtimeHours' => 'Overtime Hours',
        ];

        $rows = $this->scopedDailyQuery($request)->where('is_overtime', true)->orderBy('attendance_date')->get()
            ->map(fn (AttendanceDaily $d) => [
                'date' => $d->attendance_date->toDateString(),
                'empCode' => $d->user?->emp_code ?? $d->emp_code_raw,
                'name' => $d->user?->name,
                'department' => $d->department,
                'workedHours' => $this->minutesToHours($d->worked_minutes),
                'overtimeHours' => $this->minutesToHours($d->overtime_minutes),
            ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /** Report 7. */
    private function missingPunchReport(Request $request): array
    {
        $columns = [
            'date' => 'Date', 'empCode' => 'Employee Code', 'name' => 'Employee Name', 'department' => 'Department',
            'missingType' => 'Missing', 'capturedPunch' => 'Captured Punch',
        ];

        $rows = $this->scopedDailyQuery($request)
            ->whereIn('primary_status', [AttendanceDaily::STATUS_MISSING_CHECKIN, AttendanceDaily::STATUS_MISSING_CHECKOUT])
            ->orderBy('attendance_date')->get()
            ->map(fn (AttendanceDaily $d) => [
                'date' => $d->attendance_date->toDateString(),
                'empCode' => $d->user?->emp_code ?? $d->emp_code_raw,
                'name' => $d->user?->name,
                'department' => $d->department,
                'missingType' => $d->primary_status === AttendanceDaily::STATUS_MISSING_CHECKIN ? 'Check-in' : 'Check-out',
                'capturedPunch' => $d->primary_status === AttendanceDaily::STATUS_MISSING_CHECKIN
                    ? optional($d->last_punch_at)->format('H:i')
                    : optional($d->first_punch_at)->format('H:i'),
            ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /** Report 8 — spec §19's full audit trail, report form. */
    private function regularizationsReport(Request $request): array
    {
        [$from, $to] = $this->dateRange($request);
        $columns = [
            'date' => 'Date', 'empCode' => 'Employee Code', 'name' => 'Employee Name', 'field' => 'Field',
            'newCheckIn' => 'New Check-in', 'newCheckOut' => 'New Check-out', 'newStatus' => 'New Status',
            'reason' => 'Reason', 'approvalStatus' => 'Approval Status', 'requestedBy' => 'Requested By',
            'approvedBy' => 'Approved By', 'approvedAt' => 'Approved At',
        ];

        $query = AttendanceRegularization::query()
            ->with(['user:id,name,emp_code', 'requestedBy:id,name', 'approvedBy:id,name'])
            ->whereDate('attendance_date', '>=', $from->toDateString())
            ->whereDate('attendance_date', '<=', $to->toDateString());

        if ($request->filled('employee_id')) {
            $query->where('user_id', (int) $request->query('employee_id'));
        }
        if ($request->filled('status')) {
            $query->where('approval_status', $request->query('status'));
        }

        $rows = $query->orderBy('attendance_date')->get()->map(fn (AttendanceRegularization $r) => [
            'date' => optional($r->attendance_date)->toDateString(),
            'empCode' => $r->user?->emp_code,
            'name' => $r->user?->name,
            'field' => $r->field,
            'newCheckIn' => optional($r->new_check_in)->format('H:i'),
            'newCheckOut' => optional($r->new_check_out)->format('H:i'),
            'newStatus' => $r->new_status,
            'reason' => $r->reason,
            'approvalStatus' => $r->approval_status,
            'requestedBy' => $r->requestedBy?->name,
            'approvedBy' => $r->approvedBy?->name,
            'approvedAt' => optional($r->approved_at)->toDateString(),
        ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /** Report 9 — approved leave vs actual attendance, flagging conflicts (spec §17's "approved leave != absent" + its inverse check). */
    private function leaveVsAttendanceReport(Request $request): array
    {
        $columns = [
            'date' => 'Date', 'empCode' => 'Employee Code', 'name' => 'Employee Name',
            'status' => 'Status', 'isOnLeave' => 'On Approved Leave', 'attendanceDuringLeave' => 'Attendance During Leave (conflict)',
        ];

        $rows = $this->scopedDailyQuery($request)
            ->where(fn ($q) => $q->where('is_on_leave', true)->orWhere('attendance_during_leave', true))
            ->orderBy('attendance_date')->get()
            ->map(fn (AttendanceDaily $d) => [
                'date' => $d->attendance_date->toDateString(),
                'empCode' => $d->user?->emp_code ?? $d->emp_code_raw,
                'name' => $d->user?->name,
                'status' => $d->primary_status,
                'isOnLeave' => $d->is_on_leave,
                'attendanceDuringLeave' => $d->attendance_during_leave,
            ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /** Report 10 — grouped on the free-text `users.department` column (no `department_id` FK exists on users). */
    private function departmentSummaryReport(Request $request): array
    {
        $columns = [
            'department' => 'Department', 'employeeCount' => 'Employees', 'present' => 'Present',
            'absent' => 'Absent', 'late' => 'Late', 'earlyExit' => 'Early Exit', 'overtimeHours' => 'Overtime Hours',
        ];

        $rows = $this->scopedDailyQuery($request)->get()->groupBy(fn ($d) => $d->department ?: 'Unassigned')
            ->map(function ($days, $dept) {
                return [
                    'department' => $dept,
                    'employeeCount' => $days->pluck('user_id')->unique()->count(),
                    'present' => $days->whereIn('primary_status', [AttendanceDaily::STATUS_PRESENT, AttendanceDaily::STATUS_HOLIDAY_WORKED])->count(),
                    'absent' => $days->where('primary_status', AttendanceDaily::STATUS_ABSENT)->count(),
                    'late' => $days->where('is_late', true)->count(),
                    'earlyExit' => $days->where('is_early_exit', true)->count(),
                    'overtimeHours' => $this->minutesToHours((int) $days->sum('overtime_minutes')),
                ];
            })->sortBy('department')->values()->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /** Report 11 — spec §35's employee profile, in report/export form. Requires `employee_id`. */
    private function employeeRegisterReport(Request $request): array
    {
        $columns = [
            'date' => 'Date', 'status' => 'Status', 'firstPunch' => 'First Punch', 'lastPunch' => 'Last Punch',
            'workedHours' => 'Worked Hours', 'lateMinutes' => 'Late Minutes', 'earlyExitMinutes' => 'Early Exit Minutes',
            'overtimeHours' => 'Overtime Hours', 'isRegularized' => 'Regularized', 'source' => 'Source',
        ];

        if (! $request->filled('employee_id')) {
            return ['columns' => $columns, 'rows' => []];
        }

        $rows = $this->scopedDailyQuery($request)->orderBy('attendance_date')->get()->map(fn (AttendanceDaily $d) => [
            'date' => $d->attendance_date->toDateString(),
            'status' => $d->primary_status,
            'firstPunch' => optional($d->first_punch_at)->format('H:i'),
            'lastPunch' => optional($d->last_punch_at)->format('H:i'),
            'workedHours' => $this->minutesToHours($d->worked_minutes),
            'lateMinutes' => $d->late_minutes,
            'earlyExitMinutes' => $d->early_exit_minutes,
            'overtimeHours' => $this->minutesToHours($d->overtime_minutes),
            'isRegularized' => $d->is_regularized,
            'source' => $d->source,
        ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    /** Report 12 — device sync reconciliation (spec's reconciliation report ask). */
    private function reconciliationReport(Request $request): array
    {
        [$from, $to] = $this->dateRange($request);
        $columns = [
            'device' => 'Device', 'startedAt' => 'Started At', 'status' => 'Status', 'fetched' => 'Fetched',
            'inserted' => 'Inserted', 'duplicate' => 'Duplicate', 'unmapped' => 'Unmapped', 'failed' => 'Failed',
            'durationSeconds' => 'Duration (s)',
        ];

        $query = AttendanceSyncLog::query()->with('device:id,serial_number,name')
            ->whereBetween('started_at', [$from, $to]);

        if ($request->filled('company_code')) {
            $query->where('company_code', $request->query('company_code'));
        }

        $rows = $query->orderByDesc('started_at')->get()->map(fn (AttendanceSyncLog $log) => [
            'device' => $log->device?->name ?? $log->device_serial,
            'startedAt' => optional($log->started_at)->toDateTimeString(),
            'status' => $log->status,
            'fetched' => $log->fetched_count,
            'inserted' => $log->inserted_count,
            'duplicate' => $log->duplicate_count,
            'unmapped' => $log->unmapped_count,
            'failed' => $log->failed_count,
            'durationSeconds' => $log->durationSeconds(),
        ])->all();

        return ['columns' => $columns, 'rows' => $rows];
    }

    // ------------------------------------------------------------ dashboard

    /** Aggregate KPIs + chart-ready series for the dashboard (spec §37-ish). */
    public function dashboard(Request $request): array
    {
        [$from, $to] = $this->dateRange($request);
        $rows = $this->scopedDailyQuery($request)->get();

        $byStatus = $rows->groupBy('primary_status')->map->count();

        $trend = $rows->groupBy(fn ($d) => $d->attendance_date->toDateString())->map(function ($days, $date) {
            return [
                'date' => $date,
                'present' => $days->whereIn('primary_status', [AttendanceDaily::STATUS_PRESENT, AttendanceDaily::STATUS_HOLIDAY_WORKED])->count(),
                'absent' => $days->where('primary_status', AttendanceDaily::STATUS_ABSENT)->count(),
                'late' => $days->where('is_late', true)->count(),
            ];
        })->sortKeys()->values();

        $topLate = $rows->where('is_late', true)->groupBy('user_id')
            ->map(fn ($days) => ['user' => $days->first()->user, 'count' => $days->count()])
            ->sortByDesc('count')->take(10)->values();

        $activeEmployees = User::query()->where('is_deleted', 0)->whereNotIn('role', [0, 1])
            ->when($request->filled('company_code'), fn ($q) => $q->where('company_code', $request->query('company_code')))
            ->count();

        return [
            'range' => ['from' => $from->toDateString(), 'to' => $to->toDateString()],
            'kpis' => [
                'totalRecords' => $rows->count(),
                'activeEmployees' => $activeEmployees,
                'present' => $byStatus[AttendanceDaily::STATUS_PRESENT] ?? 0,
                'absent' => $byStatus[AttendanceDaily::STATUS_ABSENT] ?? 0,
                'late' => $rows->where('is_late', true)->count(),
                'earlyExit' => $rows->where('is_early_exit', true)->count(),
                'overtimeHours' => $this->minutesToHours((int) $rows->sum('overtime_minutes')),
                'onLeave' => $byStatus[AttendanceDaily::STATUS_ON_LEAVE] ?? 0,
                'missingPunch' => ($byStatus[AttendanceDaily::STATUS_MISSING_CHECKIN] ?? 0) + ($byStatus[AttendanceDaily::STATUS_MISSING_CHECKOUT] ?? 0),
                'pendingRegularizations' => AttendanceRegularization::where('approval_status', AttendanceRegularization::STATUS_PENDING)->count(),
            ],
            'statusBreakdown' => $byStatus,
            'trend' => $trend,
            'topLateEmployees' => $topLate,
        ];
    }
}
