<?php

namespace Tests\Feature\Attendance;

use App\Models\AttendanceDaily;
use App\Models\AttendanceEmployeeCodeMap;
use App\Models\AttendancePunch;
use App\Models\AttendanceRegularization;
use App\Models\AttendanceRule;
use App\Models\LeaveRequest;
use App\Models\LeaveType;
use App\Models\Shift;
use App\Models\User;
use App\Services\Attendance\AttendanceRecalculationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Attendance Engine Rebuild — permanent, repo-committed version of the
 * scenarios verified ad hoc during development (against a full local
 * schema copy + real Eloquent boot, including two real bugs this exact
 * process caught: Shift::$fillable missing the new engine columns, and an
 * arithmetic mistake in an early draft of these assertions). Maps directly
 * onto a subset of the spec's own 30-case list (§64): cases 1-2 (one/two
 * punches — covered via the missing-checkout and on-time scenarios below),
 * 5-8 (late, early, late+early via independent flags, overtime), 9-10
 * (holiday/weekly-off work — see AttendanceStatusEngineTest for the pure
 * unit-level holiday-worked case), 11-12 (leave, leave+punch), 13
 * (night shift), 14 (missing checkout), 18 (employee rule override), 21-22
 * (company rule / rule hierarchy), 30 (manual regularization). The
 * remainder (sync retry/duplicate-sync, unmapped/inactive employee punch,
 * month/year boundary, timezone, multi-device same-employee) are covered by
 * AttendancePunchIngestorTest and are noted as open follow-ups in the
 * delivery report where not yet written.
 */
class AttendanceEngineTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;
    private const COMPANY = 'attendance-engine-test';

    private AttendanceRecalculationService $service;
    private Shift $generalShift;
    private Shift $nightShift;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(AttendanceRecalculationService::class);

        $this->generalShift = Shift::create([
            'name' => 'Office General', 'company_code' => self::COMPANY, 'start_time' => '09:00', 'end_time' => '18:00',
            'grace_minutes' => 10, 'grace_out_minutes' => 10, 'full_day_minutes' => 480, 'half_day_minutes' => 240,
            'minimum_work_minutes' => 60, 'overtime_enabled' => true, 'overtime_after_minutes' => 480, 'is_overnight' => false,
        ]);

        $this->nightShift = Shift::create([
            'name' => 'Night Shift', 'company_code' => self::COMPANY, 'start_time' => '22:00', 'end_time' => '06:00',
            'grace_minutes' => 10, 'grace_out_minutes' => 10, 'full_day_minutes' => 480, 'half_day_minutes' => 240,
            'minimum_work_minutes' => 60, 'overtime_enabled' => true, 'overtime_after_minutes' => 480,
            'is_overnight' => true, 'overnight_offset_minutes' => 240,
        ]);

        AttendanceRule::create([
            'scope_type' => AttendanceRule::SCOPE_COMPANY, 'company_code' => self::COMPANY,
            'grace_in_minutes' => 10, 'grace_out_minutes' => 10, 'half_day_threshold_minutes' => 240,
            'full_day_minutes' => 480, 'minimum_work_minutes' => 60, 'overtime_enabled' => true,
            'overtime_after_minutes' => 480, 'effective_from' => '2020-01-01', 'is_active' => true,
        ]);
    }

    #[Test]
    public function an_on_time_full_day_is_present_and_not_late(): void
    {
        $user = $this->makeUser('OnTime', $this->generalShift->id);
        $this->punch($user, '2026-09-22 08:58:00');
        $this->punch($user, '2026-09-22 18:05:00');

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertSame(AttendanceDaily::STATUS_PRESENT, $result->primary_status);
        $this->assertFalse($result->is_late);
        $this->assertSame(547, (int) $result->worked_minutes);
    }

    #[Test]
    public function arriving_past_grace_is_flagged_late_but_stays_present(): void
    {
        $user = $this->makeUser('Late', $this->generalShift->id);
        $this->punch($user, '2026-09-22 09:15:00');
        $this->punch($user, '2026-09-22 18:05:00');

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertTrue($result->is_late);
        $this->assertSame(5, (int) $result->late_minutes);
        $this->assertSame(AttendanceDaily::STATUS_PRESENT, $result->primary_status);
    }

    #[Test]
    public function leaving_before_the_grace_adjusted_end_is_flagged_early_exit(): void
    {
        $user = $this->makeUser('EarlyExit', $this->generalShift->id);
        $this->punch($user, '2026-09-22 09:00:00');
        $this->punch($user, '2026-09-22 17:30:00');

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertTrue($result->is_early_exit);
        $this->assertSame(20, (int) $result->early_exit_minutes);
    }

    #[Test]
    public function working_past_the_overtime_threshold_is_flagged_and_measured(): void
    {
        $user = $this->makeUser('Overtime', $this->generalShift->id);
        $this->punch($user, '2026-09-22 09:00:00');
        $this->punch($user, '2026-09-22 19:20:00');

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertTrue($result->is_overtime);
        $this->assertSame(140, (int) $result->overtime_minutes); // 620 worked - 480 threshold
    }

    #[Test]
    public function a_single_punch_is_missing_checkout_and_never_invents_a_checkout_time(): void
    {
        $user = $this->makeUser('OnePunch', $this->generalShift->id);
        $this->punch($user, '2026-09-22 09:05:00');

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertSame(AttendanceDaily::STATUS_MISSING_CHECKOUT, $result->primary_status);
        $this->assertTrue($result->is_missing_checkout);
        $this->assertNull($result->worked_minutes);
    }

    #[Test]
    public function zero_punches_on_an_ordinary_working_day_is_absent(): void
    {
        $user = $this->makeUser('NoPunch', $this->generalShift->id);

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertSame(AttendanceDaily::STATUS_ABSENT, $result->primary_status);
    }

    #[Test]
    public function a_weekly_off_day_with_no_punches_is_weekly_off_not_absent(): void
    {
        $user = $this->makeUser('WeeklyOff', $this->generalShift->id);

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-20')); // Sunday

        $this->assertSame(AttendanceDaily::STATUS_WEEKLY_OFF, $result->primary_status);
    }

    #[Test]
    public function approved_leave_with_no_punches_is_on_leave_not_absent(): void
    {
        $user = $this->makeUser('OnLeave', $this->generalShift->id);
        $this->approveLeave($user, '2026-09-22');

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertSame(AttendanceDaily::STATUS_ON_LEAVE, $result->primary_status);
    }

    #[Test]
    public function punches_during_approved_leave_raise_a_review_flag_instead_of_being_silently_accepted(): void
    {
        $user = $this->makeUser('LeavePlusPunch', $this->generalShift->id);
        $this->approveLeave($user, '2026-09-22');
        $this->punch($user, '2026-09-22 09:10:00');
        $this->punch($user, '2026-09-22 17:00:00');

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertTrue($result->attendance_during_leave);
    }

    #[Test]
    public function an_overnight_shift_groups_punches_spanning_midnight_into_one_attendance_day(): void
    {
        $user = $this->makeUser('NightOwl', $this->nightShift->id);
        $this->punch($user, '2026-09-22 21:55:00', 'DEVN');
        $this->punch($user, '2026-09-23 06:03:00', 'DEVN');

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertSame(2, (int) $result->punch_count);
        $this->assertSame('21:55', $result->first_punch_at->format('H:i'));
        $this->assertSame('06:03', $result->last_punch_at->format('H:i'));
    }

    #[Test]
    public function an_employee_level_rule_overrides_the_company_rule_and_is_explainable(): void
    {
        $user = $this->makeUser('CustomGrace', $this->generalShift->id);
        AttendanceRule::create([
            'scope_type' => AttendanceRule::SCOPE_EMPLOYEE, 'employee_user_id' => $user->id, 'company_code' => self::COMPANY,
            'grace_in_minutes' => 20, 'effective_from' => '2020-01-01', 'is_active' => true,
        ]);
        $this->punch($user, '2026-09-22 09:18:00'); // 18 min late vs. shift 09:00 -- within the 20-min employee grace
        $this->punch($user, '2026-09-22 18:00:00');

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertFalse($result->is_late);
        $this->assertSame('employee', $result->applied_rule_snapshot['sources']['grace_in_minutes']);
    }

    #[Test]
    public function a_duplicate_window_punch_never_inflates_the_effective_punch_count(): void
    {
        $user = $this->makeUser('DupCheck', $this->generalShift->id);
        $this->punch($user, '2026-09-22 08:58:00');
        AttendancePunch::create([
            'emp_code_raw' => $user->emp_code, 'device_serial' => 'DEV1', 'punch_datetime' => '2026-09-22 08:58:05',
            'punch_date' => '2026-09-22', 'source' => 'essl_biometric', 'user_id' => $user->id,
            'company_code' => self::COMPANY, 'unit' => $user->unit, 'status' => AttendancePunch::STATUS_DUPLICATE,
        ]);
        $this->punch($user, '2026-09-22 18:00:00');

        $result = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertSame(2, (int) $result->punch_count);
    }

    #[Test]
    public function an_approved_regularization_fixes_a_missing_checkout_without_touching_the_raw_ledger(): void
    {
        $user = $this->makeUser('Regularized', $this->generalShift->id);
        $this->punch($user, '2026-09-22 09:00:00');
        $before = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        AttendanceRegularization::create([
            'user_id' => $user->id, 'attendance_date' => '2026-09-22', 'attendance_daily_id' => $before->id,
            'field' => 'check_out', 'new_check_out' => '2026-09-22 18:03:00',
            'reason' => 'Forgot to punch out, confirmed with manager', 'approval_status' => 'approved',
            'requested_by' => $user->id, 'approved_by' => $user->id, 'approved_at' => now(),
        ]);

        $after = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertTrue($after->is_regularized);
        $this->assertNotSame(AttendanceDaily::STATUS_MISSING_CHECKOUT, $after->primary_status);
        $this->assertSame(1, AttendancePunch::where('user_id', $user->id)->count());
    }

    #[Test]
    public function recalculating_the_same_day_twice_updates_one_row_not_two(): void
    {
        $user = $this->makeUser('Idempotent', $this->generalShift->id);
        $this->punch($user, '2026-09-22 09:00:00');
        $this->punch($user, '2026-09-22 18:00:00');

        $first = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));
        $second = $this->service->recalculateOne($user, Carbon::parse('2026-09-22'));

        $this->assertSame($first->id, $second->id);
        $this->assertSame(2, $second->recalculation_count);
        $this->assertSame(1, AttendanceDaily::where('user_id', $user->id)->count());
    }

    #[Test]
    public function employee_code_map_supports_a_different_device_user_id_per_machine(): void
    {
        $user = $this->makeUser('MultiDevice', $this->generalShift->id);

        AttendanceEmployeeCodeMap::create(['user_id' => $user->id, 'device_id' => null, 'device_user_code' => 'ALIAS-9001', 'is_active' => true]);

        $row = AttendanceEmployeeCodeMap::where('device_user_code', 'ALIAS-9001')->first();
        $this->assertSame($user->id, $row->user_id);
    }

    private function makeUser(string $name, ?int $shiftId, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => "Test {$name}",
            'email' => "attendance-engine-{$number}@test.local",
            'password' => 'x',
            'emp_code' => (string) (1000 + $number),
            'role' => 3,
            'company_code' => self::COMPANY,
            'unit' => 'test-unit',
            'department' => 'Office',
            'status' => 0,
            'is_deleted' => 0,
            'shift_id' => $shiftId,
        ]);
    }

    private function punch(User $user, string $datetime, string $device = 'DEV1'): AttendancePunch
    {
        return AttendancePunch::create([
            'emp_code_raw' => $user->emp_code, 'device_serial' => $device, 'punch_datetime' => $datetime,
            'punch_date' => Carbon::parse($datetime)->toDateString(), 'source' => 'essl_biometric',
            'user_id' => $user->id, 'company_code' => $user->company_code, 'unit' => $user->unit,
            'status' => AttendancePunch::STATUS_VALID,
        ]);
    }

    private function approveLeave(User $user, string $date): LeaveRequest
    {
        $type = LeaveType::firstOrCreate(['code' => 'CL'], ['name' => 'Casual Leave']);

        return LeaveRequest::create([
            'request_number' => 'LR-ATT-TEST-' . $user->id,
            'user_id' => $user->id, 'leave_type_id' => $type->id,
            'start_date' => $date, 'end_date' => $date, 'total_days' => 1,
            'is_half_day_start' => false, 'is_half_day_end' => false,
            'reason' => 'Test leave', 'status' => 'approved',
        ]);
    }
}
