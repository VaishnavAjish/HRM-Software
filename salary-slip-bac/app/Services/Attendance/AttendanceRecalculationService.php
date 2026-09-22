<?php

namespace App\Services\Attendance;

use App\Models\AttendanceDaily;
use App\Models\AttendanceRegularization;
use App\Models\Calendar;
use App\Models\CalendarHoliday;
use App\Models\Company;
use App\Models\LeaveRequest;
use App\Models\Shift;
use App\Models\Unit;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Attendance Engine Rebuild — Phase 1/2.
 *
 * The orchestrator implementing the spec's own pipeline (§72):
 *
 *   raw punches -> employee code mapping (already applied by
 *   AttendancePunchIngestor before this runs) -> attendance day resolution
 *   -> shift resolution -> rule hierarchy -> first/last punch -> work/break/
 *   late/early/OT -> leave/holiday/weekly-off check -> final daily row.
 *
 * Writes ONLY to `attendance_daily`. Never touches `attendance_punches`
 * (raw, permanent) or the legacy `attendances` table (still serving the
 * current page, untouched).
 */
class AttendanceRecalculationService
{
    public function __construct(
        private readonly AttendanceRuleResolver $ruleResolver = new AttendanceRuleResolver(),
        private readonly AttendanceDayResolver $dayResolver = new AttendanceDayResolver(),
        private readonly AttendanceStatusEngine $statusEngine = new AttendanceStatusEngine(),
    ) {
    }

    /** Recalculates one employee's one attendance day. Idempotent — safe to call repeatedly. */
    public function recalculateOne(User $employee, Carbon $date): AttendanceDaily
    {
        $resolved = $this->ruleResolver->resolve($employee, $date);
        $ruleValues = $resolved['values'];
        $shift = $resolved['shift'];

        $this->applyCalendarWeeklyOff($ruleValues, $resolved['sources'], $employee);

        $punches = $this->dayResolver->punchesForAttendanceDay($employee, $date, $shift);

        $isHoliday = $this->isHoliday($employee, $date);
        $isWeeklyOff = $this->isWeeklyOff($date, $ruleValues);
        $leave = $this->approvedLeaveFor($employee, $date);

        // Approved regularization overrides the punch-derived first/last
        // BEFORE status computation (spec §19) — the raw ledger is never
        // touched; this is purely an input substitution for this one
        // recalculation.
        $regularization = AttendanceRegularization::query()
            ->where('user_id', $employee->id)
            ->whereDate('attendance_date', $date->toDateString())
            ->where('approval_status', AttendanceRegularization::STATUS_APPROVED)
            ->latest('approved_at')
            ->first();

        $effectivePunches = $punches;
        if ($regularization) {
            $effectivePunches = $this->applyRegularizationOverride($punches, $regularization);
        }

        $result = $this->statusEngine->compute(
            $effectivePunches,
            $ruleValues,
            $shift,
            $isHoliday,
            $isWeeklyOff,
            $leave !== null
        );

        if ($regularization) {
            $result['is_regularized'] = true;
            $result['is_manual'] = true;
            if ($regularization->new_status) {
                $result['primary_status'] = $regularization->new_status;
            }
        }

        $existing = AttendanceDaily::query()
            ->where('user_id', $employee->id)
            ->whereDate('attendance_date', $date->toDateString())
            ->first();

        $payload = [
            'user_id' => $employee->id,
            'emp_code_raw' => $employee->emp_code,
            'company_code' => $employee->company_code,
            'unit' => $employee->unit,
            'department' => $employee->department,
            'attendance_date' => $date->toDateString(),
            'shift_id' => $shift?->id,
            'applied_rule_id' => null, // composite across fields — see applied_rule_snapshot
            'applied_rule_snapshot' => [
                'values' => $ruleValues,
                'sources' => $resolved['sources'],
                'rule_ids' => $resolved['rule_ids'],
                'shift_code' => $shift?->shift_code,
            ],
            'first_punch_at' => $result['first_punch_at'],
            'last_punch_at' => $result['last_punch_at'],
            'worked_minutes' => $result['worked_minutes'],
            'break_minutes' => $result['break_minutes'],
            'late_minutes' => $result['late_minutes'],
            'early_exit_minutes' => $result['early_exit_minutes'],
            'overtime_minutes' => $result['overtime_minutes'],
            'punch_count' => $result['punch_count'],
            'primary_status' => $result['primary_status'],
            'is_late' => $result['is_late'],
            'is_early_exit' => $result['is_early_exit'],
            'is_overtime' => $result['is_overtime'],
            'is_missing_checkin' => $result['is_missing_checkin'],
            'is_missing_checkout' => $result['is_missing_checkout'],
            'is_holiday' => $result['is_holiday'],
            'is_weekly_off' => $result['is_weekly_off'],
            'is_on_leave' => $result['is_on_leave'],
            'is_regularized' => $result['is_regularized'] ?? false,
            'is_manual' => $result['is_manual'] ?? false,
            'attendance_during_leave' => $result['attendance_during_leave'],
            'leave_request_id' => $leave?->id,
            'regularization_id' => $regularization?->id,
            'source' => $regularization ? 'manual' : 'essl_biometric',
            'computed_at' => now(),
        ];

        return DB::transaction(function () use ($existing, $payload) {
            if ($existing) {
                $payload['recalculation_count'] = $existing->recalculation_count + 1;
                $existing->update($payload);

                return $existing->fresh();
            }

            $payload['recalculation_count'] = 1;

            return AttendanceDaily::create($payload);
        });
    }

    /**
     * Recalculates every day in [$from, $to] for every active employee
     * matching the given scope. Bounded by explicit scope + date range
     * always (spec §42 — never an unscoped full-history recompute).
     *
     * @return array{processed:int, days:int}
     */
    public function recalculateScope(
        ?string $companyCode,
        ?string $unit,
        ?string $department,
        ?int $employeeUserId,
        Carbon $from,
        Carbon $to
    ): array {
        $employees = User::query()
            ->where('is_deleted', 0)
            ->whereNotIn('role', [0, 1])
            ->when($companyCode, fn ($q) => $q->where('company_code', $companyCode))
            ->when($unit, fn ($q) => $q->where('unit', $unit))
            ->when($department, fn ($q) => $q->where('department', $department))
            ->when($employeeUserId, fn ($q) => $q->where('id', $employeeUserId))
            ->get();

        $processed = 0;
        $days = 0;
        for ($date = $from->copy(); $date->lte($to); $date->addDay()) {
            foreach ($employees as $employee) {
                $this->recalculateOne($employee, $date->copy());
                $processed++;
            }
            $days++;
        }

        return ['processed' => $processed, 'days' => $days, 'employees' => $employees->count()];
    }

    /**
     * Overrides the punch collection's effective first/last with the
     * regularization's new times, as lightweight stand-in AttendancePunch-
     * shaped objects — the real rows in `attendance_punches` are never
     * written to.
     */
    private function applyRegularizationOverride($punches, AttendanceRegularization $reg)
    {
        $clone = $punches->map(fn ($p) => clone $p);

        if ($reg->new_check_in) {
            $in = $clone->first() ? clone $clone->first() : new \App\Models\AttendancePunch();
            $in->punch_datetime = $reg->new_check_in;
            $clone->prepend($in);
        }
        if ($reg->new_check_out) {
            $out = $clone->last() ? clone $clone->last() : new \App\Models\AttendancePunch();
            $out->punch_datetime = $reg->new_check_out;
            $clone->push($out);
        }

        return $clone->sortBy('punch_datetime')->values();
    }

    private function approvedLeaveFor(User $employee, Carbon $date): ?LeaveRequest
    {
        return LeaveRequest::query()
            ->where('user_id', $employee->id)
            ->where('status', 'approved')
            ->whereDate('start_date', '<=', $date->toDateString())
            ->whereDate('end_date', '>=', $date->toDateString())
            ->first();
    }

    /**
     * Bridges the attendance module's string company_code/unit convention
     * to the existing structured `calendars`/`companies`/`units` tables
     * (which key by numeric id) — read-only, no schema change to either
     * side. Falls back to "no holiday" if no calendar is configured yet,
     * never throws.
     */
    private function isHoliday(User $employee, Carbon $date): bool
    {
        $calendar = $this->resolveCalendar($employee);
        if (! $calendar) {
            return false;
        }

        return CalendarHoliday::query()
            ->where('calendar_id', $calendar->id)
            ->whereDate('date', $date->toDateString())
            ->where('kind', '!=', 'workday')
            ->exists();
    }

    private function isWeeklyOff(Carbon $date, array $ruleValues): bool
    {
        $offDays = $ruleValues['weekly_off_days'] ?? [0];

        return in_array($date->dayOfWeek, $offDays, true);
    }

    /**
     * Only steps in when the rule cascade fell all the way through to the
     * hard default (no company/branch/department/employee rule ever set
     * weekly_off_days) — lets an already-configured `calendars.work_week`
     * (existing data) act as the next fallback before the blunt
     * "Sunday only" default, rather than forcing every admin to re-enter
     * weekly-off twice.
     */
    private function applyCalendarWeeklyOff(array &$ruleValues, array $sources, User $employee): void
    {
        if (($sources['weekly_off_days'] ?? 'default') !== 'default') {
            return;
        }

        $calendar = $this->resolveCalendar($employee);
        if ($calendar && is_array($calendar->work_week) && ! empty($calendar->work_week)) {
            $ruleValues['weekly_off_days'] = $calendar->work_week;
        }
    }

    private function resolveCalendar(User $employee): ?Calendar
    {
        if (! $employee->company_code) {
            return null;
        }

        $primaryCompanyCode = trim(explode(',', $employee->company_code)[0]);
        $company = Company::query()->where('code', $primaryCompanyCode)->first();
        if (! $company) {
            return null;
        }

        $unitId = null;
        if ($employee->unit) {
            $unitId = Unit::query()->where('company_id', $company->id)->where('code', $employee->unit)->value('id');
        }

        // Prefer a unit-specific calendar; fall back to the company-wide one.
        return Calendar::query()
            ->where('company_id', $company->id)
            ->where(fn ($q) => $q->where('unit_id', $unitId)->orWhereNull('unit_id'))
            ->orderByRaw('unit_id IS NULL') // unit-specific (false=0) sorts before company-wide (true=1)
            ->first();
    }
}
