<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — Phase 2.
 *
 * `attendance_regularizations` — manual corrections (spec §19), fully
 * audited: what changed, who changed it, why, and whether it's approved.
 * NEVER overwrites `attendance_punches` (the raw source of truth stays
 * exactly what the device reported) or even `attendance_daily` directly —
 * `AttendanceRecalculationService` applies an approved, active
 * regularization as an override INPUT the next time that day is
 * (re)calculated, so the effect is reproducible and reversible (reject/undo
 * a regularization and recalculating reverts to the raw-punch-derived
 * result).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('attendance_regularizations')) {
            return;
        }

        Schema::create('attendance_regularizations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('attendance_date');
            $table->foreignId('attendance_daily_id')->nullable()->constrained('attendance_daily')->nullOnDelete();

            $table->string('field'); // check_in | check_out | status | both
            $table->timestamp('original_check_in')->nullable();
            $table->timestamp('original_check_out')->nullable();
            $table->timestamp('new_check_in')->nullable();
            $table->timestamp('new_check_out')->nullable();
            $table->string('original_status')->nullable();
            $table->string('new_status')->nullable();

            $table->text('reason');
            $table->string('approval_status')->default('pending'); // pending | approved | rejected
            $table->foreignId('requested_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->text('approval_remarks')->nullable();

            $table->string('ip_address')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'attendance_date']);
            $table->index('approval_status');
        });

        // Now that attendance_regularizations exists, wire the FK on
        // attendance_daily.regularization_id declared (unconstrained) in the
        // previous migration — order-independent, additive, no data loss.
        if (Schema::hasTable('attendance_daily') && Schema::hasColumn('attendance_daily', 'regularization_id')) {
            Schema::table('attendance_daily', function (Blueprint $table) {
                $table->foreign('regularization_id', 'att_daily_regularization_fk')
                    ->references('id')->on('attendance_regularizations')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('attendance_daily')) {
            Schema::table('attendance_daily', function (Blueprint $table) {
                $table->dropForeign('att_daily_regularization_fk');
            });
        }
        Schema::dropIfExists('attendance_regularizations');
    }
};
