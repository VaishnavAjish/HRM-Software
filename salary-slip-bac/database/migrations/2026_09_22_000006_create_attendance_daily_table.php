<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — Phase 1/2.
 *
 * `attendance_daily` — the CALCULATED/derived layer (spec §43's pipeline:
 * raw_punches -> attendance_processor -> daily_attendance -> monthly
 * summary). One row per employee per attendance-day, produced ONLY by
 * `AttendanceRecalculationService` from `attendance_punches` — never
 * hand-edited (corrections go through `attendance_regularizations`, which
 * this table's `is_regularized`/`regularization_id` point at).
 *
 * Deliberately a NEW, additive table — the existing `attendances` table
 * (which the current AttendanceView.jsx page reads) is untouched and keeps
 * working. Nothing is repointed at this table until the UI rebuild phase
 * explicitly does so.
 *
 * `applied_rule_snapshot` freezes the exact numbers used for THIS row at
 * calculation time (belt-and-suspenders alongside `attendance_rules`'
 * effective_from/to versioning in Phase 1's migration): even if a rule is
 * edited later, re-reading an already-calculated day still shows exactly
 * what was applied, without needing to re-resolve history.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('attendance_daily')) {
            return;
        }

        Schema::create('attendance_daily', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('emp_code_raw')->nullable(); // for UNMAPPED rows with no user_id yet
            $table->string('company_code')->nullable();
            $table->string('unit')->nullable();
            $table->string('department')->nullable();
            $table->date('attendance_date');

            $table->foreignId('shift_id')->nullable()->constrained('shifts')->nullOnDelete();
            $table->foreignId('applied_rule_id')->nullable()->constrained('attendance_rules')->nullOnDelete();
            $table->jsonb('applied_rule_snapshot')->nullable(); // frozen numbers actually used (see docblock)

            $table->timestamp('first_punch_at')->nullable();
            $table->timestamp('last_punch_at')->nullable();
            $table->unsignedInteger('worked_minutes')->nullable();
            $table->unsignedInteger('break_minutes')->nullable();
            $table->unsignedInteger('late_minutes')->default(0);
            $table->unsignedInteger('early_exit_minutes')->default(0);
            $table->unsignedInteger('overtime_minutes')->default(0);
            $table->unsignedSmallInteger('punch_count')->default(0);

            // Primary status (spec §11's full catalogue) — the "what a user
            // sees at a glance"; every ambiguity that catalogue creates is
            // resolved by keeping the flags below authoritative and this
            // column a single best-fit label.
            $table->string('primary_status')->default('PENDING_REVIEW');

            $table->boolean('is_late')->default(false);
            $table->boolean('is_early_exit')->default(false);
            $table->boolean('is_overtime')->default(false);
            $table->boolean('is_missing_checkin')->default(false);
            $table->boolean('is_missing_checkout')->default(false);
            $table->boolean('is_holiday')->default(false);
            $table->boolean('is_weekly_off')->default(false);
            $table->boolean('is_on_leave')->default(false);
            $table->boolean('is_regularized')->default(false);
            $table->boolean('is_manual')->default(false);
            $table->boolean('attendance_during_leave')->default(false); // spec §20's review flag

            $table->foreignId('leave_request_id')->nullable()->constrained('leave_requests')->nullOnDelete();
            $table->foreignId('regularization_id')->nullable(); // FK added after attendance_regularizations exists (next migration)
            $table->string('source')->default('essl_biometric'); // essl_biometric | manual | import | mixed

            $table->timestamp('computed_at')->nullable();
            $table->unsignedInteger('recalculation_count')->default(0);
            $table->timestamps();

            $table->unique(['user_id', 'attendance_date'], 'att_daily_user_date_unique');
            $table->index(['company_code', 'unit', 'attendance_date']);
            $table->index(['department', 'attendance_date']);
            $table->index('primary_status');
            $table->index('attendance_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_daily');
    }
};
