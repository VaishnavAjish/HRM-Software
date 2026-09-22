<?php

namespace App\Services\Attendance;

use App\Models\AttendanceDaily;
use App\Models\Shift;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Attendance Engine Rebuild — Phase 1.
 *
 * Turns (ordered VALID punches for one attendance day + the resolved rule
 * values + holiday/weekly-off/leave facts) into a single computed result:
 * first/last punch, worked/late/early/overtime minutes, and a `primary_status`
 * plus independent boolean flags.
 *
 * Reconciles a tension in the spec itself: §11's catalogue lists 20 values
 * including LATE_AND_EARLY_EXIT, but §11 ALSO says "maintain primary_status
 * AND flags... Example: Primary status PRESENT, flags Late=true Early
 * Exit=false Overtime=true" — i.e. flags should carry late/early/overtime,
 * not the primary status. This engine follows that second instruction: it
 * only ever emits PRESENT / HALF_DAY / ABSENT / MISSING_CHECKIN /
 * MISSING_CHECKOUT / HOLIDAY / HOLIDAY_WORKED / WEEKLY_OFF / ON_LEAVE /
 * PENDING_REVIEW / NO_PUNCH / INVALID as `primary_status`; late/early/OT
 * always ride as flags on top of whichever of those applies. The remaining
 * catalogue values (REGULARIZED, MANUAL, WORK_FROM_HOME, FIELD_WORK) are
 * applied by AttendanceRecalculationService/regularization flow, not this
 * pure calculator.
 *
 * MISSING_CHECKIN vs MISSING_CHECKOUT: the eSSL source used here reports no
 * IN/OUT tag (§40's own note under EsslBiometricService), so a single
 * unpaired punch cannot be reliably told apart as one or the other. This
 * engine assumes the far more common real case — a lone punch is a
 * check-in with no check-out — and always reports MISSING_CHECKOUT for
 * that case. MISSING_CHECKIN stays defined and available for any future
 * punch source that DOES supply a reliable punch_type.
 */
class AttendanceStatusEngine
{
    /**
     * @param  Collection<int,\App\Models\AttendancePunch>  $punches  ordered chronologically, VALID only
     * @param  array  $ruleValues  AttendanceRuleResolver::resolve()['values']
     */
    public function compute(
        Collection $punches,
        array $ruleValues,
        ?Shift $shift,
        bool $isHoliday,
        bool $isWeeklyOff,
        bool $isOnLeave
    ): array {
        $punchCount = $punches->count();
        $first = $punches->first()?->punch_datetime;
        $last = $punches->last()?->punch_datetime;

        $result = [
            'first_punch_at' => $first,
            'last_punch_at' => $last,
            'worked_minutes' => null,
            'break_minutes' => null,
            'late_minutes' => 0,
            'early_exit_minutes' => 0,
            'overtime_minutes' => 0,
            'punch_count' => $punchCount,
            'primary_status' => AttendanceDaily::STATUS_PENDING_REVIEW,
            'is_late' => false,
            'is_early_exit' => false,
            'is_overtime' => false,
            'is_missing_checkin' => false,
            'is_missing_checkout' => false,
            'is_holiday' => $isHoliday,
            'is_weekly_off' => $isWeeklyOff,
            'is_on_leave' => $isOnLeave,
            'attendance_during_leave' => false,
        ];

        // --- Leave takes priority per spec §20: approved leave + no punch = ON_LEAVE, never ABSENT.
        if ($isOnLeave && $punchCount === 0) {
            $result['primary_status'] = AttendanceDaily::STATUS_ON_LEAVE;

            return $result;
        }
        if ($isOnLeave && $punchCount > 0) {
            // Punches exist during approved leave — flagged for human
            // review rather than silently accepted or silently discarded
            // (spec §20).
            $result['attendance_during_leave'] = true;
            $result['primary_status'] = AttendanceDaily::STATUS_PENDING_REVIEW;
            $this->computeWorkedTime($result, $punches, $ruleValues);

            return $result;
        }

        // --- Holiday.
        if ($isHoliday && $punchCount === 0) {
            $result['primary_status'] = AttendanceDaily::STATUS_HOLIDAY;

            return $result;
        }
        if ($isHoliday && $punchCount > 0) {
            $result['primary_status'] = AttendanceDaily::STATUS_HOLIDAY_WORKED;
            $this->computeWorkedTime($result, $punches, $ruleValues);
            $this->computeOvertime($result, $ruleValues);

            return $result;
        }

        // --- Weekly off: no punch = WEEKLY_OFF (rest day, not absence).
        // Punches present on a weekly-off day still get evaluated as a
        // normal working day below (is_weekly_off stays true throughout so
        // reports/overtime policy can treat it specially), matching how a
        // rotational-off employee who came in is normally handled.
        if ($isWeeklyOff && $punchCount === 0) {
            $result['primary_status'] = AttendanceDaily::STATUS_WEEKLY_OFF;

            return $result;
        }

        // --- Ordinary working day.
        if ($punchCount === 0) {
            $result['primary_status'] = AttendanceDaily::STATUS_ABSENT;

            return $result;
        }

        if ($punchCount === 1) {
            $result['is_missing_checkout'] = true;
            $result['primary_status'] = AttendanceDaily::STATUS_MISSING_CHECKOUT;

            return $result;
        }

        $this->computeWorkedTime($result, $punches, $ruleValues);
        $worked = $result['worked_minutes'] ?? 0;

        if ($worked < (int) $ruleValues['minimum_work_minutes']) {
            $result['primary_status'] = AttendanceDaily::STATUS_ABSENT;
        } elseif ($worked < (int) $ruleValues['half_day_threshold_minutes']) {
            $result['primary_status'] = AttendanceDaily::STATUS_ABSENT;
        } elseif ($worked < (int) $ruleValues['full_day_minutes']) {
            $result['primary_status'] = AttendanceDaily::STATUS_HALF_DAY;
        } else {
            $result['primary_status'] = AttendanceDaily::STATUS_PRESENT;
        }

        $this->computeLateEarly($result, $first, $last, $shift, $ruleValues);
        $this->computeOvertime($result, $ruleValues);

        return $result;
    }

    private function computeWorkedTime(array &$result, Collection $punches, array $ruleValues): void
    {
        $first = $punches->first()?->punch_datetime;
        $last = $punches->last()?->punch_datetime;

        if (! $first || ! $last || $punches->count() < 2) {
            return;
        }

        if (($ruleValues['break_policy'] ?? 'first_last') === 'multi_punch' && $punches->count() >= 4 && $punches->count() % 2 === 0) {
            // Pair IN/OUT/IN/OUT... sum each interval (spec §14 Option B).
            // Only engaged when there's a clean even number of punches (>=4)
            // to pair — an odd count falls back to first/last below rather
            // than guessing which punch is unpaired.
            $worked = 0;
            $ordered = $punches->values();
            for ($i = 0; $i + 1 < $ordered->count(); $i += 2) {
                $worked += $ordered[$i]->punch_datetime->diffInMinutes($ordered[$i + 1]->punch_datetime);
            }
            $result['worked_minutes'] = $worked;
            $span = $first->diffInMinutes($last);
            $result['break_minutes'] = max(0, $span - $worked);

            return;
        }

        // Simple mode (default): first punch in, last punch out (spec §2, §14 Option A).
        $result['worked_minutes'] = $first->diffInMinutes($last);
        $result['break_minutes'] = 0;
    }

    private function computeLateEarly(array &$result, ?Carbon $first, ?Carbon $last, ?Shift $shift, array $ruleValues): void
    {
        if (! $shift || ! $first || ! $last) {
            return; // cannot judge lateness/earliness with no assigned shift to compare against
        }

        $shiftStart = Carbon::parse($first->toDateString() . ' ' . $shift->start_time);
        $shiftEnd = Carbon::parse($first->toDateString() . ' ' . $shift->end_time);
        if ($shift->is_overnight && $shiftEnd->lte($shiftStart)) {
            $shiftEnd->addDay();
        }

        $graceIn = (int) $ruleValues['grace_in_minutes'];
        $graceOut = (int) $ruleValues['grace_out_minutes'];

        $lateBy = $shiftStart->copy()->addMinutes($graceIn)->diffInMinutes($first, false);
        if ($lateBy > 0) {
            $result['is_late'] = true;
            $result['late_minutes'] = $lateBy;
        }

        $earlyBy = $last->diffInMinutes($shiftEnd->copy()->subMinutes($graceOut), false);
        if ($earlyBy > 0) {
            $result['is_early_exit'] = true;
            $result['early_exit_minutes'] = $earlyBy;
        }
    }

    private function computeOvertime(array &$result, array $ruleValues): void
    {
        if (! ($ruleValues['overtime_enabled'] ?? false)) {
            return;
        }

        $threshold = $ruleValues['overtime_after_minutes'] ?? $ruleValues['full_day_minutes'];
        $worked = $result['worked_minutes'] ?? 0;

        if ($worked > $threshold) {
            $result['is_overtime'] = true;
            $result['overtime_minutes'] = $worked - $threshold;
        }
    }
}
