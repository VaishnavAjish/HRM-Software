<?php

namespace App\Services\Attendance;

use App\Models\AttendancePunch;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Attendance Engine Rebuild — Phase 1.
 *
 * Resolves which raw punches belong to a given "attendance day", correctly
 * handling overnight shifts (spec §4) without changing behaviour for the
 * (overwhelming majority) non-overnight case — a non-overnight employee's
 * attendance day is exactly the calendar date, same as the system already
 * implicitly assumes today.
 *
 * Overnight shift (e.g. 22:00-06:00, offset 240min/4h): attendance day N's
 * window is [shift_start(date N) - offset, shift_start(date N+1) - offset).
 * A night shift starting 22:00 with the 4h default offset therefore opens
 * its window at 18:00 the same day and closes it at 18:00 the next day —
 * comfortably covering both a 21:55 IN and a 06:03 OUT the next calendar
 * date, exactly the spec's own worked example.
 */
class AttendanceDayResolver
{
    /**
     * Every VALID punch belonging to $employee's attendance day $date,
     * ordered chronologically.
     */
    public function punchesForAttendanceDay(User $employee, Carbon $date, ?Shift $shift): Collection
    {
        [$windowStart, $windowEnd] = $this->windowFor($date, $shift);

        return AttendancePunch::query()
            ->where('user_id', $employee->id)
            ->where('status', AttendancePunch::STATUS_VALID)
            ->whereBetween('punch_datetime', [$windowStart, $windowEnd->copy()->subSecond()])
            ->orderBy('punch_datetime')
            ->get();
    }

    /** [windowStart, windowEnd) for the attendance day $date under $shift. */
    public function windowFor(Carbon $date, ?Shift $shift): array
    {
        if ($shift && $shift->is_overnight) {
            $startTime = $shift->start_time ?: '00:00:00';
            $windowStart = Carbon::parse($date->toDateString() . ' ' . $startTime)
                ->subMinutes((int) ($shift->overnight_offset_minutes ?? 240));

            return [$windowStart, $windowStart->copy()->addDay()];
        }

        return [$date->copy()->startOfDay(), $date->copy()->addDay()->startOfDay()];
    }

    /**
     * The inverse direction: given one punch's real timestamp, which
     * attendance day does it belong to? Needed right after a sync lands new
     * punches, to know which day(s) to (re)queue for calculation.
     */
    public function attendanceDateForPunch(Carbon $punchAt, ?Shift $shift): Carbon
    {
        if (! $shift || ! $shift->is_overnight) {
            return $punchAt->copy()->startOfDay();
        }

        $startTime = $shift->start_time ?: '00:00:00';
        $offset = (int) ($shift->overnight_offset_minutes ?? 240);
        $sameDayWindowStart = Carbon::parse($punchAt->toDateString() . ' ' . $startTime)->subMinutes($offset);

        // Before this calendar date's own window opens -> the punch is the
        // tail end of the PREVIOUS attendance day's overnight session.
        return $punchAt->lt($sameDayWindowStart)
            ? $punchAt->copy()->subDay()->startOfDay()
            : $punchAt->copy()->startOfDay();
    }
}
