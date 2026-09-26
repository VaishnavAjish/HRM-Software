<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — every attendance_rules field so far has been
 * duration/minutes-based (grace_in_minutes etc.), with a real clock-time
 * anchor only ever coming from a separately-assigned Shift row. Admins
 * managing rules had no way to just type "9:30 to 18:30" for a department
 * or employee directly on the rule itself, and half-day was decidable only
 * by total minutes worked, never by "punched in after 11 AM".
 *
 * These three columns let a rule optionally carry its own schedule, still
 * resolved through the same per-field scope cascade as every other field
 * (see AttendanceRuleResolver) — falling back to the employee's assigned
 * Shift when a rule doesn't set them, exactly as before.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_rules', function (Blueprint $table) {
            $table->time('scheduled_start_time')->nullable()->after('shift_id');
            $table->time('scheduled_end_time')->nullable()->after('scheduled_start_time');
            $table->time('half_day_cutoff_time')->nullable()->after('half_day_threshold_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_rules', function (Blueprint $table) {
            $table->dropColumn(['scheduled_start_time', 'scheduled_end_time', 'half_day_cutoff_time']);
        });
    }
};
