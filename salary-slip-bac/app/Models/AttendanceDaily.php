<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * attendance_daily — the calculated/derived layer. Written ONLY by
 * AttendanceRecalculationService. See the creating migration's docblock.
 */
class AttendanceDaily extends Model
{
    protected $table = 'attendance_daily'; // Eloquent's pluralizer would otherwise guess "attendance_dailies"

    // Primary statuses (spec §11)
    public const STATUS_PRESENT = 'PRESENT';
    public const STATUS_ABSENT = 'ABSENT';
    public const STATUS_HALF_DAY = 'HALF_DAY';
    public const STATUS_MISSING_CHECKOUT = 'MISSING_CHECKOUT';
    public const STATUS_MISSING_CHECKIN = 'MISSING_CHECKIN';
    public const STATUS_WEEKLY_OFF = 'WEEKLY_OFF';
    public const STATUS_HOLIDAY = 'HOLIDAY';
    public const STATUS_HOLIDAY_WORKED = 'HOLIDAY_WORKED';
    public const STATUS_ON_LEAVE = 'ON_LEAVE';
    public const STATUS_REGULARIZED = 'REGULARIZED';
    public const STATUS_MANUAL = 'MANUAL';
    public const STATUS_PENDING_REVIEW = 'PENDING_REVIEW';
    public const STATUS_NO_PUNCH = 'NO_PUNCH';
    public const STATUS_INVALID = 'INVALID';

    protected $fillable = [
        'user_id', 'emp_code_raw', 'company_code', 'unit', 'department', 'attendance_date',
        'shift_id', 'applied_rule_id', 'applied_rule_snapshot',
        'first_punch_at', 'last_punch_at', 'worked_minutes', 'break_minutes',
        'late_minutes', 'early_exit_minutes', 'overtime_minutes', 'punch_count',
        'primary_status', 'is_late', 'is_early_exit', 'is_overtime', 'is_missing_checkin',
        'is_missing_checkout', 'is_holiday', 'is_weekly_off', 'is_on_leave', 'is_regularized',
        'is_manual', 'attendance_during_leave', 'leave_request_id', 'regularization_id',
        'source', 'computed_at', 'recalculation_count',
    ];

    protected function casts(): array
    {
        return [
            'attendance_date' => 'date',
            'applied_rule_snapshot' => 'array',
            'first_punch_at' => 'datetime',
            'last_punch_at' => 'datetime',
            'is_late' => 'boolean',
            'is_early_exit' => 'boolean',
            'is_overtime' => 'boolean',
            'is_missing_checkin' => 'boolean',
            'is_missing_checkout' => 'boolean',
            'is_holiday' => 'boolean',
            'is_weekly_off' => 'boolean',
            'is_on_leave' => 'boolean',
            'is_regularized' => 'boolean',
            'is_manual' => 'boolean',
            'attendance_during_leave' => 'boolean',
            'computed_at' => 'datetime',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function shift()
    {
        return $this->belongsTo(Shift::class);
    }

    public function appliedRule()
    {
        return $this->belongsTo(AttendanceRule::class, 'applied_rule_id');
    }

    public function leaveRequest()
    {
        return $this->belongsTo(LeaveRequest::class);
    }

    public function regularization()
    {
        return $this->belongsTo(AttendanceRegularization::class, 'regularization_id');
    }
}
