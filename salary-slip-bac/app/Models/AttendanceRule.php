<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * attendance_rules — the company/branch/department/employee rule hierarchy.
 * See the creating migration's docblock for the full design.
 */
class AttendanceRule extends Model
{
    public const SCOPE_GLOBAL = 'global';
    public const SCOPE_COMPANY = 'company';
    public const SCOPE_BRANCH = 'branch';
    public const SCOPE_DEPARTMENT = 'department';
    public const SCOPE_EMPLOYEE = 'employee';

    /** Precedence order, most specific first — AttendanceRuleResolver walks this. */
    public const SCOPE_PRECEDENCE = [
        self::SCOPE_EMPLOYEE,
        self::SCOPE_DEPARTMENT,
        self::SCOPE_BRANCH,
        self::SCOPE_COMPANY,
        self::SCOPE_GLOBAL,
    ];

    protected $fillable = [
        'scope_type', 'company_code', 'unit', 'department', 'employee_user_id', 'shift_id', 'name',
        'scheduled_start_time', 'scheduled_end_time',
        'grace_in_minutes', 'grace_out_minutes', 'late_threshold_minutes', 'early_exit_threshold_minutes',
        'half_day_threshold_minutes', 'half_day_cutoff_time', 'minimum_work_minutes', 'full_day_minutes',
        'overtime_enabled', 'overtime_after_minutes', 'break_policy', 'weekly_off_days',
        'biometric_required', 'manual_attendance_allowed', 'attendance_exempt',
        'effective_from', 'effective_to', 'is_active', 'created_by', 'change_reason',
    ];

    protected function casts(): array
    {
        return [
            'weekly_off_days' => 'array',
            'overtime_enabled' => 'boolean',
            'biometric_required' => 'boolean',
            'manual_attendance_allowed' => 'boolean',
            'attendance_exempt' => 'boolean',
            'is_active' => 'boolean',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function shift()
    {
        return $this->belongsTo(Shift::class);
    }

    public function employee()
    {
        return $this->belongsTo(User::class, 'employee_user_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
