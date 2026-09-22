<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\Attendance\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\AttendancePunch;
use App\Models\Shift;
use App\Models\User;
use App\Services\Attendance\AttendanceRuleResolver;
use App\Services\Attendance\AttendanceStatusEngine;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * `POST /v1/attendance/simulate` — the Rule Simulator (spec §33), described
 * there as "critical for testing rules before production".
 *
 * Runs the EXACT SAME resolver + status engine an admin can inspect a real
 * `attendance_daily` row's `applied_rule_snapshot` for, against hypothetical
 * punch times the caller supplies — never touches `attendance_punches` or
 * `attendance_daily`. An admin can dry-run "what would 09:12/12:30/13:15/
 * 18:05 produce for employee X on date Y" before it ever happens for real.
 */
class AttendanceSimulatorController extends Controller
{
    use RespondsWithEnvelope;

    public function __construct(
        private readonly AttendanceRuleResolver $ruleResolver,
        private readonly AttendanceStatusEngine $statusEngine,
    ) {
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employee_id' => ['required', 'integer', 'exists:users,id'],
            'date' => ['required', 'date'],
            'punches' => ['required', 'array', 'min:0'],
            'punches.*' => ['date_format:H:i', 'string'],
            'is_holiday_override' => ['sometimes', 'nullable', 'boolean'],
            'is_weekly_off_override' => ['sometimes', 'nullable', 'boolean'],
        ]);

        $employee = User::findOrFail($data['employee_id']);
        $date = Carbon::parse($data['date']);

        $resolved = $this->ruleResolver->resolve($employee, $date);
        $shift = $resolved['shift'];

        $punches = new Collection(collect($data['punches'])
            ->sort()
            ->values()
            ->map(function (string $time) use ($date) {
                $punch = new AttendancePunch();
                $punch->punch_datetime = Carbon::parse($date->toDateString() . ' ' . $time);
                $punch->status = AttendancePunch::STATUS_VALID;

                return $punch;
            }));

        $isHoliday = $data['is_holiday_override'] ?? false;
        $isWeeklyOff = $data['is_weekly_off_override'] ?? in_array($date->dayOfWeek, $resolved['values']['weekly_off_days'] ?? [0], true);

        $result = $this->statusEngine->compute($punches, $resolved['values'], $shift, $isHoliday, $isWeeklyOff, false);

        return $this->ok([
            'employee' => $employee->only(['id', 'name', 'emp_code']),
            'date' => $date->toDateString(),
            'shift' => $shift ? $shift->only(['id', 'name', 'shift_code', 'start_time', 'end_time', 'is_overnight']) : null,
            'rule_breakdown' => [
                'values' => $resolved['values'],
                'sources' => $resolved['sources'],
            ],
            'result' => $result,
        ]);
    }
}
