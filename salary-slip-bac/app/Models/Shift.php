<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Shift extends Model
{
    public const BREAK_POLICIES = ['first_last', 'multi_punch'];

    protected $fillable = [
        'name', 'company_code', 'unit', 'start_time', 'end_time', 'grace_minutes', 'description',
        // Attendance Engine Rebuild — Phase 1 fields (migration
        // 2026_09_22_000003_add_engine_fields_to_shifts_table). Every one of
        // these MUST be listed here or Shift::create()/fill() silently drops
        // it (Eloquent mass-assignment protection) — caught by
        // AttendanceRecalculationService's own test suite, which is exactly
        // why it's listed exhaustively rather than switched to $guarded.
        'shift_code', 'grace_out_minutes', 'minimum_work_minutes', 'full_day_minutes',
        'half_day_minutes', 'overtime_enabled', 'overtime_after_minutes', 'break_policy',
        'is_overnight', 'overnight_offset_minutes', 'weekly_off_days', 'is_active',
    ];

    protected function casts(): array
    {
        return [
            'overtime_enabled' => 'boolean',
            'is_overnight' => 'boolean',
            'is_active' => 'boolean',
            'weekly_off_days' => 'array',
        ];
    }

    public function employees()
    {
        return $this->hasMany(User::class, 'shift_id');
    }
}
