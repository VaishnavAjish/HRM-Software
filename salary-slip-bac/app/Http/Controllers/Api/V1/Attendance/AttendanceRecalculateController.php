<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\Attendance\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Jobs\Attendance\RecalculateAttendanceJob;
use App\Models\AttendanceRecalculationJob;
use App\Services\Attendance\AttendanceRecalculationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * `POST /v1/attendance/recalculate` — spec §59. Always scoped (company/
 * branch/department/employee) and always a bounded date range — never an
 * unscoped, unbounded recompute (spec §42, §60).
 *
 * Small requests (<=3 days AND a single employee, e.g. the regularization-
 * approval auto-trigger's direct service call, or a quick one-day UI
 * refresh) run inline so the HTTP response carries the fresh
 * `attendance_daily` row immediately. Anything broader is dispatched onto
 * `RecalculateAttendanceJob` (spec §60) via the `database` queue connection
 * already configured for this app — tracked in `attendance_recalculation_jobs`
 * and pollable via `GET /v1/attendance/recalculation-jobs/{id}`. An explicit
 * `async` boolean in the request body overrides the automatic choice either
 * way.
 */
class AttendanceRecalculateController extends Controller
{
    use RespondsWithEnvelope;

    private const AUTO_QUEUE_THRESHOLD_DAYS = 3;

    public function __construct(private readonly AttendanceRecalculationService $service)
    {
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'company_code' => ['sometimes', 'nullable', 'string'],
            'unit' => ['sometimes', 'nullable', 'string'],
            'department' => ['sometimes', 'nullable', 'string'],
            'employee_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'date' => ['required_without_all:date_from,date_to', 'nullable', 'date'],
            'date_from' => ['required_with:date_to', 'nullable', 'date'],
            'date_to' => ['required_with:date_from', 'nullable', 'date', 'after_or_equal:date_from'],
            'async' => ['sometimes', 'nullable', 'boolean'],
        ]);

        $from = isset($data['date_from']) ? Carbon::parse($data['date_from']) : Carbon::parse($data['date']);
        $to = isset($data['date_to']) ? Carbon::parse($data['date_to']) : Carbon::parse($data['date']);

        if ($from->diffInDays($to) > 92) {
            return response()->json([
                'success' => false,
                'error' => ['code' => 'RANGE_TOO_LARGE', 'message' => 'Recalculation is limited to 92 days per request — split into smaller ranges.'],
            ], 422);
        }

        $spanDays = $from->diffInDays($to) + 1;
        $isSingleEmployee = ! empty($data['employee_id']);
        $shouldQueue = array_key_exists('async', $data)
            ? (bool) $data['async']
            : ($spanDays > self::AUTO_QUEUE_THRESHOLD_DAYS || ! $isSingleEmployee);

        $tracking = AttendanceRecalculationJob::create([
            'company_code' => $data['company_code'] ?? null,
            'unit' => $data['unit'] ?? null,
            'department' => $data['department'] ?? null,
            'employee_user_id' => $data['employee_id'] ?? null,
            'date_from' => $from->toDateString(),
            'date_to' => $to->toDateString(),
            'mode' => $shouldQueue ? AttendanceRecalculationJob::MODE_QUEUED : AttendanceRecalculationJob::MODE_SYNC,
            'status' => AttendanceRecalculationJob::STATUS_RUNNING,
            'triggered_by' => auth('api')->id(),
            'started_at' => now(),
        ]);

        if ($shouldQueue) {
            RecalculateAttendanceJob::dispatch($tracking->id);

            return $this->ok([
                'mode' => 'queued',
                'job' => $tracking->fresh(),
                'message' => 'Recalculation queued — poll GET /v1/attendance/recalculation-jobs/'.$tracking->id.' for status.',
            ], 202);
        }

        try {
            $result = $this->service->recalculateScope(
                $data['company_code'] ?? null,
                $data['unit'] ?? null,
                $data['department'] ?? null,
                $data['employee_id'] ?? null,
                $from,
                $to
            );

            $tracking->update([
                'status' => AttendanceRecalculationJob::STATUS_SUCCESS,
                'processed_count' => $result['processed'],
                'days_count' => $result['days'],
                'employees_count' => $result['employees'],
                'completed_at' => now(),
            ]);

            return $this->ok(['mode' => 'sync', 'job' => $tracking->fresh(), 'result' => $result]);
        } catch (\Throwable $e) {
            $tracking->update([
                'status' => AttendanceRecalculationJob::STATUS_FAILED,
                'error_message' => $e->getMessage(),
                'completed_at' => now(),
            ]);

            throw $e;
        }
    }

    /** `GET /v1/attendance/recalculation-jobs` — recent recalculation runs, sync and queued alike. */
    public function index(Request $request): JsonResponse
    {
        $query = AttendanceRecalculationJob::query()->with(['employee:id,name,emp_code', 'triggeredBy:id,name']);

        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }

        return $this->ok($query->orderByDesc('id')->paginate(min((int) $request->query('per_page', 25), 100)));
    }

    /** `GET /v1/attendance/recalculation-jobs/{id}` — poll a single (typically queued) run. */
    public function show(int $id): JsonResponse
    {
        $tracking = AttendanceRecalculationJob::with(['employee:id,name,emp_code', 'triggeredBy:id,name'])->find($id);
        if (! $tracking) {
            return $this->missing('Recalculation job not found.');
        }

        return $this->ok($tracking);
    }
}
