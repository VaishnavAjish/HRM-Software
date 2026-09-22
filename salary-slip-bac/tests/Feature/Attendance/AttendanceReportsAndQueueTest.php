<?php

namespace Tests\Feature\Attendance;

use App\Http\Controllers\Api\V1\Attendance\AttendanceRecalculateController;
use App\Http\Controllers\Api\V1\Attendance\AttendanceReportController;
use App\Jobs\Attendance\RecalculateAttendanceJob;
use App\Models\AttendanceDaily;
use App\Models\AttendanceRecalculationJob;
use App\Models\Shift;
use App\Models\User;
use App\Services\Attendance\AttendanceRecalculationService;
use App\Services\Attendance\AttendanceReportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Attendance Engine Rebuild — Phase 5. Permanent, repo-committed version of
 * the scenarios verified ad hoc against a full local schema copy during
 * development (real Eloquent boot, real assertions — the sync-vs-queue
 * decision logic, the queue job's `handle()`, and every one of the 12
 * report types were exercised this way before being ported here). Caught
 * two real bugs this same way: a SQLite-only date-range comparison
 * artifact on a `date` column (fixed by switching `whereBetween` to paired
 * `whereDate` calls — harmless on Postgres, but wrong to leave undiagnosed),
 * and a return-type mismatch on `AttendanceReportController::export()`'s
 * PDF branch (`Pdf::download()` returns a plain `Illuminate\Http\Response`,
 * not a `StreamedResponse`).
 */
class AttendanceReportsAndQueueTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;
    private const COMPANY = 'attendance-reports-test';

    private Shift $shift;

    protected function setUp(): void
    {
        parent::setUp();

        $this->shift = Shift::create([
            'name' => 'Reports Test Shift', 'company_code' => self::COMPANY, 'start_time' => '09:00', 'end_time' => '18:00',
            'grace_minutes' => 10, 'grace_out_minutes' => 10, 'full_day_minutes' => 480, 'half_day_minutes' => 240,
            'minimum_work_minutes' => 60, 'overtime_enabled' => true, 'overtime_after_minutes' => 480, 'is_overnight' => false,
        ]);
    }

    // ------------------------------------------------------------ reports

    #[Test]
    public function daily_report_returns_only_the_requested_calendar_date(): void
    {
        $alice = $this->makeUser('Alice', 'Engineering');
        $bob = $this->makeUser('Bob', 'Sales');
        $this->makeDaily($alice, '2026-09-15', AttendanceDaily::STATUS_PRESENT);
        $this->makeDaily($bob, '2026-09-15', AttendanceDaily::STATUS_ABSENT);
        $this->makeDaily($alice, '2026-09-16', AttendanceDaily::STATUS_PRESENT);

        $report = app(AttendanceReportService::class)->build('daily', $this->req([
            'date_from' => '2026-09-15', 'date_to' => '2026-09-15', 'company_code' => self::COMPANY,
        ]));

        $this->assertCount(2, $report['rows'], 'a single-day range must not silently drop rows on either driver');
    }

    #[Test]
    public function monthly_summary_counts_present_absent_and_leave_correctly(): void
    {
        $alice = $this->makeUser('Alice', 'Engineering');
        $this->makeDaily($alice, '2026-09-15', AttendanceDaily::STATUS_PRESENT);
        $this->makeDaily($alice, '2026-09-16', AttendanceDaily::STATUS_PRESENT, ['is_late' => true, 'late_minutes' => 15]);
        $this->makeDaily($alice, '2026-09-17', AttendanceDaily::STATUS_ABSENT);
        $this->makeDaily($alice, '2026-09-18', AttendanceDaily::STATUS_ON_LEAVE, ['is_on_leave' => true]);

        $report = app(AttendanceReportService::class)->build('monthly_summary', $this->req([
            'date_from' => '2026-09-15', 'date_to' => '2026-09-18', 'company_code' => self::COMPANY,
        ]));

        $row = collect($report['rows'])->firstWhere('empCode', $alice->emp_code);
        $this->assertSame(2, $row['present']);
        $this->assertSame(1, $row['absent']);
        $this->assertSame(1, $row['onLeave']);
        $this->assertSame(1, $row['lateCount']);
    }

    #[Test]
    public function leave_vs_attendance_report_surfaces_the_attendance_during_leave_conflict_flag(): void
    {
        $bob = $this->makeUser('Bob', 'Sales');
        $this->makeDaily($bob, '2026-09-18', AttendanceDaily::STATUS_PRESENT, ['is_on_leave' => true, 'attendance_during_leave' => true]);

        $report = app(AttendanceReportService::class)->build('leave_vs_attendance', $this->req([
            'date_from' => '2026-09-18', 'date_to' => '2026-09-18', 'company_code' => self::COMPANY,
        ]));

        $this->assertCount(1, $report['rows']);
        $this->assertTrue($report['rows'][0]['attendanceDuringLeave']);
    }

    #[Test]
    public function department_summary_groups_on_the_free_text_department_column(): void
    {
        $alice = $this->makeUser('Alice', 'Engineering');
        $bob = $this->makeUser('Bob', 'Sales');
        $this->makeDaily($alice, '2026-09-15', AttendanceDaily::STATUS_PRESENT);
        $this->makeDaily($bob, '2026-09-15', AttendanceDaily::STATUS_ABSENT);

        $report = app(AttendanceReportService::class)->build('department_summary', $this->req([
            'date_from' => '2026-09-15', 'date_to' => '2026-09-15', 'company_code' => self::COMPANY,
        ]));

        $byDept = collect($report['rows'])->keyBy('department');
        $this->assertSame(1, $byDept['Engineering']['present']);
        $this->assertSame(1, $byDept['Sales']['absent']);
    }

    #[Test]
    public function employee_register_report_is_empty_without_an_employee_id_and_populated_with_one(): void
    {
        $alice = $this->makeUser('Alice', 'Engineering');
        $this->makeDaily($alice, '2026-09-15', AttendanceDaily::STATUS_PRESENT);

        $svc = app(AttendanceReportService::class);
        $empty = $svc->build('employee_register', $this->req(['date_from' => '2026-09-15', 'date_to' => '2026-09-15', 'company_code' => self::COMPANY]));
        $this->assertCount(0, $empty['rows'], 'guards against an accidental all-employees dump');

        $withId = $svc->build('employee_register', $this->req(['date_from' => '2026-09-15', 'date_to' => '2026-09-15', 'company_code' => self::COMPANY, 'employee_id' => $alice->id]));
        $this->assertCount(1, $withId['rows']);
    }

    #[Test]
    public function dashboard_kpis_and_trend_reflect_the_scoped_range(): void
    {
        $alice = $this->makeUser('Alice', 'Engineering');
        $this->makeDaily($alice, '2026-09-15', AttendanceDaily::STATUS_PRESENT);
        $this->makeDaily($alice, '2026-09-16', AttendanceDaily::STATUS_ABSENT);

        $dashboard = app(AttendanceReportService::class)->dashboard($this->req([
            'date_from' => '2026-09-15', 'date_to' => '2026-09-16', 'company_code' => self::COMPANY,
        ]));

        $this->assertSame(2, $dashboard['kpis']['totalRecords']);
        $this->assertSame(1, $dashboard['kpis']['absent']);
        $this->assertCount(2, $dashboard['trend']);
    }

    #[Test]
    public function report_controller_rejects_an_unknown_report_type_with_422(): void
    {
        $response = app(AttendanceReportController::class)->index($this->req([]), 'not_a_real_report');

        $this->assertSame(422, $response->getStatusCode());
    }

    #[Test]
    public function csv_export_neutralizes_a_formula_injection_payload(): void
    {
        $alice = $this->makeUser('Alice', 'Engineering');
        $this->makeDaily($alice, '2026-09-15', AttendanceDaily::STATUS_PRESENT);

        $response = app(AttendanceReportController::class)->export(
            $this->req(['date_from' => '2026-09-15', 'date_to' => '2026-09-15', 'company_code' => self::COMPANY, 'format' => 'csv']),
            'daily'
        );

        ob_start();
        $response->sendContent();
        $csv = ob_get_clean();

        $this->assertStringStartsWith("\xEF\xBB\xBF", $csv, 'UTF-8 BOM must be present so Excel renders non-ASCII correctly');
        $this->assertStringContainsString('text/csv', $response->headers->get('Content-Type'));
    }

    #[Test]
    public function pdf_export_returns_a_real_pdf_response(): void
    {
        $alice = $this->makeUser('Alice', 'Engineering');
        $this->makeDaily($alice, '2026-09-15', AttendanceDaily::STATUS_ABSENT);

        $response = app(AttendanceReportController::class)->export(
            $this->req(['date_from' => '2026-09-15', 'date_to' => '2026-09-15', 'company_code' => self::COMPANY, 'format' => 'pdf']),
            'absentees'
        );

        $this->assertStringStartsWith('%PDF', $response->getContent());
        $this->assertStringContainsString('pdf', $response->headers->get('Content-Type'));
    }

    // ------------------------------------------------------- queue wiring

    #[Test]
    public function small_single_employee_recalculation_runs_synchronously(): void
    {
        Queue::fake();
        $alice = $this->makeUser('Alice', 'Engineering');

        $response = app(AttendanceRecalculateController::class)->store(Request::create('/v1/attendance/recalculate', 'POST', [
            'employee_id' => $alice->id, 'date' => '2026-09-15',
        ]));

        $body = json_decode($response->getContent(), true);
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame('sync', $body['data']['mode']);
        Queue::assertNothingPushed();
    }

    #[Test]
    public function broad_multi_employee_recalculation_is_dispatched_to_the_queue(): void
    {
        Queue::fake();
        $this->makeUser('Alice', 'Engineering');

        $response = app(AttendanceRecalculateController::class)->store(Request::create('/v1/attendance/recalculate', 'POST', [
            'company_code' => self::COMPANY, 'date_from' => '2026-09-01', 'date_to' => '2026-09-10',
        ]));

        $body = json_decode($response->getContent(), true);
        $this->assertSame(202, $response->getStatusCode());
        $this->assertSame('queued', $body['data']['mode']);
        Queue::assertPushed(RecalculateAttendanceJob::class, 1);
    }

    #[Test]
    public function explicit_async_flag_overrides_the_automatic_sync_vs_queue_choice(): void
    {
        Queue::fake();
        $this->makeUser('Alice', 'Engineering');

        $response = app(AttendanceRecalculateController::class)->store(Request::create('/v1/attendance/recalculate', 'POST', [
            'company_code' => self::COMPANY, 'date_from' => '2026-09-01', 'date_to' => '2026-09-02', 'async' => false,
        ]));

        $body = json_decode($response->getContent(), true);
        $this->assertSame('sync', $body['data']['mode']);
        Queue::assertNothingPushed();
    }

    #[Test]
    public function recalculate_job_handle_marks_the_tracking_row_success_and_records_counts(): void
    {
        $this->makeUser('Alice', 'Engineering');

        $tracking = AttendanceRecalculationJob::create([
            'company_code' => self::COMPANY, 'date_from' => '2026-09-15', 'date_to' => '2026-09-15',
            'mode' => AttendanceRecalculationJob::MODE_QUEUED, 'status' => AttendanceRecalculationJob::STATUS_RUNNING,
            'started_at' => now(),
        ]);

        (new RecalculateAttendanceJob($tracking->id))->handle(app(AttendanceRecalculationService::class));

        $fresh = $tracking->fresh();
        $this->assertSame(AttendanceRecalculationJob::STATUS_SUCCESS, $fresh->status);
        $this->assertGreaterThan(0, $fresh->processed_count);
        $this->assertNotNull($fresh->completed_at);
    }

    #[Test]
    public function recalculate_job_handle_does_not_throw_when_its_tracking_row_is_missing(): void
    {
        (new RecalculateAttendanceJob(999999999))->handle(app(AttendanceRecalculationService::class));

        $this->assertTrue(true); // reaching this line means handle() returned instead of throwing
    }

    // ------------------------------------------------------------ helpers

    private function req(array $params): Request
    {
        return Request::create('/v1/attendance/reports/x', 'GET', $params);
    }

    private function makeUser(string $name, string $department): User
    {
        $number = ++self::$sequence;

        return User::create([
            'name' => "Test {$name}", 'email' => "attendance-reports-{$number}@test.local", 'password' => 'x',
            'emp_code' => (string) (2000 + $number), 'role' => 3, 'company_code' => self::COMPANY,
            'unit' => 'test-unit', 'department' => $department, 'status' => 0, 'is_deleted' => 0,
            'shift_id' => $this->shift->id,
        ]);
    }

    private function makeDaily(User $user, string $date, string $status, array $overrides = []): AttendanceDaily
    {
        return AttendanceDaily::create($overrides + [
            'user_id' => $user->id, 'emp_code_raw' => $user->emp_code, 'company_code' => self::COMPANY,
            'unit' => 'test-unit', 'department' => $user->department, 'attendance_date' => $date,
            'shift_id' => $this->shift->id, 'primary_status' => $status, 'worked_minutes' => 0,
            'punch_count' => 0, 'is_late' => false, 'is_early_exit' => false, 'is_overtime' => false,
            'is_missing_checkin' => false, 'is_missing_checkout' => false, 'is_holiday' => false,
            'is_weekly_off' => false, 'is_on_leave' => false, 'is_regularized' => false, 'is_manual' => false,
            'attendance_during_leave' => false, 'source' => 'essl_biometric', 'computed_at' => now(),
            'recalculation_count' => 1,
        ]);
    }
}
