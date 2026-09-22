<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — Phase 1.
 *
 * Extends the EXISTING `shifts` table (name/company_code/unit/start_time/
 * end_time/grace_minutes/description — untouched) with the shift-engine
 * fields the spec asks for (§5). Every new column is nullable or has a
 * default that reproduces today's behaviour, so every existing shift row
 * and every existing reader of this table (ShiftController, ShiftManagement.jsx)
 * keeps working unchanged. `grace_minutes` (existing) is kept as-is and is
 * what `AttendanceRuleResolver` treats as "grace in" when a rule row doesn't
 * specify its own.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shifts', function (Blueprint $table) {
            if (! Schema::hasColumn('shifts', 'shift_code')) {
                $table->string('shift_code')->nullable()->after('name');
            }
            if (! Schema::hasColumn('shifts', 'grace_out_minutes')) {
                $table->unsignedInteger('grace_out_minutes')->default(0)->after('grace_minutes');
            }
            if (! Schema::hasColumn('shifts', 'minimum_work_minutes')) {
                // Below this, even a same-day IN+OUT pair is MISSING/INVALID
                // rather than a real (if short) day of work.
                $table->unsignedInteger('minimum_work_minutes')->nullable()->after('grace_out_minutes');
            }
            if (! Schema::hasColumn('shifts', 'full_day_minutes')) {
                $table->unsignedInteger('full_day_minutes')->default(480)->after('minimum_work_minutes'); // 8h
            }
            if (! Schema::hasColumn('shifts', 'half_day_minutes')) {
                $table->unsignedInteger('half_day_minutes')->default(240)->after('full_day_minutes'); // 4h
            }
            if (! Schema::hasColumn('shifts', 'overtime_enabled')) {
                $table->boolean('overtime_enabled')->default(false)->after('half_day_minutes');
            }
            if (! Schema::hasColumn('shifts', 'overtime_after_minutes')) {
                $table->unsignedInteger('overtime_after_minutes')->nullable()->after('overtime_enabled'); // null = full_day_minutes
            }
            // 'first_last' = simple mode (first punch in, last punch out);
            // 'multi_punch' = pair IN/OUT/IN/OUT... and sum each interval
            // (spec §14 Option A / Option B).
            if (! Schema::hasColumn('shifts', 'break_policy')) {
                $table->string('break_policy')->default('first_last')->after('overtime_after_minutes');
            }
            if (! Schema::hasColumn('shifts', 'is_overnight')) {
                // Also covers the spec's separately-named "shift_cross_midnight"
                // — both describe the same "attendance day spans two calendar
                // dates" condition, so one flag drives both, documented once
                // here rather than as two columns that could disagree.
                $table->boolean('is_overnight')->default(false)->after('break_policy');
            }
            if (! Schema::hasColumn('shifts', 'overnight_offset_minutes')) {
                // How many minutes BEFORE start_time the attendance day is
                // considered to begin, for an overnight shift (spec §4's
                // "attendance_day_start = shift_start - configurable offset").
                $table->unsignedInteger('overnight_offset_minutes')->default(240)->after('is_overnight'); // 4h default
            }
            if (! Schema::hasColumn('shifts', 'weekly_off_days')) {
                // [0..6] (0=Sunday), Carbon::dayOfWeek numbering. NULL = defer
                // entirely to the company/branch calendar's `work_week`
                // (spec §22) rather than the shift.
                $table->jsonb('weekly_off_days')->nullable()->after('overnight_offset_minutes');
            }
            if (! Schema::hasColumn('shifts', 'is_active')) {
                $table->boolean('is_active')->default(true)->after('weekly_off_days');
            }
        });
    }

    public function down(): void
    {
        Schema::table('shifts', function (Blueprint $table) {
            foreach ([
                'shift_code', 'grace_out_minutes', 'minimum_work_minutes', 'full_day_minutes',
                'half_day_minutes', 'overtime_enabled', 'overtime_after_minutes', 'break_policy',
                'is_overnight', 'overnight_offset_minutes', 'weekly_off_days', 'is_active',
            ] as $col) {
                if (Schema::hasColumn('shifts', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
