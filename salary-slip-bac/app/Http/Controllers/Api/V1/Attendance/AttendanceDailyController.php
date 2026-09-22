<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\Attendance\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\AttendanceDaily;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * `GET /v1/attendance/daily`, `GET /v1/attendance/monthly`,
 * `GET /v1/attendance/employee/{id}`, `GET /v1/attendance/{id}/details`.
 *
 * Reads ONLY from `attendance_daily` (the calculated layer) — never
 * recomputes on the fly (spec §42). A day that hasn't been calculated yet
 * simply doesn't have a row here until `POST /v1/attendance/recalculate`
 * (or the scheduled job, once wired) produces one.
 */
class AttendanceDailyController extends Controller
{
    use RespondsWithEnvelope;

    /** GET /v1/attendance/daily — the redesigned table's data source. */
    public function daily(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date' => ['required', 'date'],
            'company_code' => ['sometimes', 'nullable', 'string'],
            'unit' => ['sometimes', 'nullable', 'string'],
            'department' => ['sometimes', 'nullable', 'string'],
            'status' => ['sometimes', 'nullable', 'string'], // comma list
            'search' => ['sometimes', 'nullable', 'string', 'max:190'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:200'],
        ]);

        $query = AttendanceDaily::query()->with(['user:id,name,emp_code,department,unit,company_code', 'shift:id,name,shift_code']);
        $this->applyCommonFilters($query, $data);

        return $this->ok($query->orderBy('user_id')->paginate(min((int) ($data['per_page'] ?? 25), 200)));
    }

    /** GET /v1/attendance/monthly — one row per employee, spread across days (spec §34). */
    public function monthly(Request $request): JsonResponse
    {
        $data = $request->validate([
            'month' => ['required', 'integer', 'min:1', 'max:12'],
            'year' => ['required', 'integer', 'min:2000'],
            'company_code' => ['sometimes', 'nullable', 'string'],
            'unit' => ['sometimes', 'nullable', 'string'],
            'department' => ['sometimes', 'nullable', 'string'],
        ]);

        $start = Carbon::create((int) $data['year'], (int) $data['month'], 1)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $rows = AttendanceDaily::query()
            ->with('user:id,name,emp_code,department,unit,company_code')
            // whereDate, not whereBetween on the raw string -- see
            // AttendanceReportService::scopedDailyQuery()'s docblock for why
            // a plain whereBetween(['Y-m-d','Y-m-d']) is SQLite-fragile on a
            // `date` column even though it's fine on Postgres.
            ->whereDate('attendance_date', '>=', $start->toDateString())
            ->whereDate('attendance_date', '<=', $end->toDateString())
            ->when($data['company_code'] ?? null, fn ($q, $v) => $q->where('company_code', $v))
            ->when($data['unit'] ?? null, fn ($q, $v) => $q->where('unit', $v))
            ->when($data['department'] ?? null, fn ($q, $v) => $q->where('department', $v))
            ->get();

        $byEmployee = $rows->groupBy('user_id')->map(function ($days) {
            $first = $days->first();

            return [
                'user' => $first->user,
                'days' => $days->keyBy(fn ($d) => $d->attendance_date->format('j'))
                    ->map(fn ($d) => [
                        'status' => $d->primary_status,
                        'is_late' => $d->is_late,
                        'is_overtime' => $d->is_overtime,
                        'worked_minutes' => $d->worked_minutes,
                    ]),
                'totals' => [
                    'present' => $days->whereIn('primary_status', [AttendanceDaily::STATUS_PRESENT, AttendanceDaily::STATUS_HALF_DAY, AttendanceDaily::STATUS_HOLIDAY_WORKED])->count(),
                    'absent' => $days->where('primary_status', AttendanceDaily::STATUS_ABSENT)->count(),
                    'half_day' => $days->where('primary_status', AttendanceDaily::STATUS_HALF_DAY)->count(),
                    'leave' => $days->where('primary_status', AttendanceDaily::STATUS_ON_LEAVE)->count(),
                    'weekly_off' => $days->where('primary_status', AttendanceDaily::STATUS_WEEKLY_OFF)->count(),
                    'holiday' => $days->whereIn('primary_status', [AttendanceDaily::STATUS_HOLIDAY, AttendanceDaily::STATUS_HOLIDAY_WORKED])->count(),
                    'late' => $days->where('is_late', true)->count(),
                    'early_exit' => $days->where('is_early_exit', true)->count(),
                    'overtime_minutes' => $days->sum('overtime_minutes'),
                    'worked_minutes' => $days->sum('worked_minutes'),
                ],
            ];
        })->values();

        return $this->ok(['month' => (int) $data['month'], 'year' => (int) $data['year'], 'employees' => $byEmployee]);
    }

    /** GET /v1/attendance/employee/{id} — spec §35's employee attendance profile. */
    public function employee(Request $request, int $id): JsonResponse
    {
        $user = User::find($id);
        if (! $user) {
            return $this->missing('Employee not found.');
        }

        $data = $request->validate([
            'from' => ['sometimes', 'nullable', 'date'],
            'to' => ['sometimes', 'nullable', 'date'],
        ]);
        $from = isset($data['from']) ? Carbon::parse($data['from']) : now()->subDays(30);
        $to = isset($data['to']) ? Carbon::parse($data['to']) : now();

        $rows = AttendanceDaily::query()
            ->where('user_id', $user->id)
            ->whereDate('attendance_date', '>=', $from->toDateString())
            ->whereDate('attendance_date', '<=', $to->toDateString())
            ->orderBy('attendance_date')
            ->get();

        return $this->ok(['user' => $user->only(['id', 'name', 'emp_code', 'department', 'unit', 'company_code']), 'days' => $rows]);
    }

    /** GET /v1/attendance/{id}/details — the detail drawer's data (spec §30-§31). */
    public function details(int $id): JsonResponse
    {
        $daily = AttendanceDaily::with(['user', 'shift', 'leaveRequest', 'regularization.requestedBy', 'regularization.approvedBy'])->find($id);
        if (! $daily) {
            return $this->missing('Attendance record not found.');
        }

        $punches = \App\Models\AttendancePunch::query()
            ->where('user_id', $daily->user_id)
            ->whereDate('punch_date', $daily->attendance_date->toDateString())
            ->orWhere(function ($q) use ($daily) {
                // overnight sessions can carry a tail punch into the next calendar date
                $q->where('user_id', $daily->user_id)
                    ->whereDate('punch_date', $daily->attendance_date->copy()->addDay()->toDateString());
            })
            ->orderBy('punch_datetime')
            ->get();

        return $this->ok([
            'attendance' => $daily,
            'punch_timeline' => $punches,
        ]);
    }

    private function applyCommonFilters($query, array $data): void
    {
        $query->whereDate('attendance_date', $data['date']);
        if (! empty($data['company_code'])) {
            $query->where('company_code', $data['company_code']);
        }
        if (! empty($data['unit'])) {
            $query->where('unit', $data['unit']);
        }
        if (! empty($data['department'])) {
            $query->where('department', $data['department']);
        }
        if (! empty($data['status'])) {
            $query->whereIn('primary_status', explode(',', $data['status']));
        }
        if (! empty($data['search'])) {
            $search = $data['search'];
            $query->whereHas('user', fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('emp_code', 'like', "%{$search}%"));
        }
    }
}
