<?php

namespace App\Jobs\Attendance;

use App\Models\AttendanceRecalculationJob;
use App\Services\Attendance\AttendanceRecalculationService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;

/**
 * Attendance Engine Rebuild — Phase 4 (spec §60's "background job for
 * sync/recalculation"). QUEUE_CONNECTION=database is already configured for
 * this app (see .env) — this job needs a running `php artisan queue:work`
 * worker to actually run asynchronously; without one it simply waits in the
 * `jobs` table until a worker picks it up (it will NOT silently run inline
 * the way `sync` would).
 *
 * Only dispatched for large/broad recalculation requests
 * (AttendanceRecalculateController decides sync vs queued — see that class);
 * small single-day/single-employee requests still run inline so their HTTP
 * response reflects the fresh `attendance_daily` row immediately.
 */
class RecalculateAttendanceJob implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $tries = 2;
    public array $backoff = [30, 120];
    public int $timeout = 1800; // large scopes can legitimately take a while

    public function __construct(public int $trackingJobId)
    {
    }

    public function handle(AttendanceRecalculationService $service): void
    {
        $tracking = AttendanceRecalculationJob::find($this->trackingJobId);
        if (! $tracking) {
            Log::warning('attendance_recalc_job_skipped', ['tracking_id' => $this->trackingJobId, 'reason' => 'tracking_row_missing']);

            return;
        }

        try {
            $result = $service->recalculateScope(
                $tracking->company_code,
                $tracking->unit,
                $tracking->department,
                $tracking->employee_user_id,
                Carbon::parse($tracking->date_from),
                Carbon::parse($tracking->date_to)
            );

            $tracking->update([
                'status' => AttendanceRecalculationJob::STATUS_SUCCESS,
                'processed_count' => $result['processed'],
                'days_count' => $result['days'],
                'employees_count' => $result['employees'],
                'completed_at' => now(),
            ]);
        } catch (\Throwable $e) {
            Log::error('attendance_recalc_job_failed', ['tracking_id' => $this->trackingJobId, 'error' => $e->getMessage()]);
            $tracking->update([
                'status' => AttendanceRecalculationJob::STATUS_FAILED,
                'error_message' => $e->getMessage(),
                'completed_at' => now(),
            ]);

            throw $e; // let the queue's own retry/backoff decide
        }
    }

    public function failed(\Throwable $e): void
    {
        $tracking = AttendanceRecalculationJob::find($this->trackingJobId);
        if ($tracking && $tracking->status === AttendanceRecalculationJob::STATUS_RUNNING) {
            $tracking->update([
                'status' => AttendanceRecalculationJob::STATUS_FAILED,
                'error_message' => $e->getMessage(),
                'completed_at' => now(),
            ]);
        }
    }
}
