<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — Phase 4 (queue wiring, spec §60).
 *
 * `attendance_recalculation_jobs` — one row per POST /v1/attendance/recalculate
 * request, tracked from RUNNING -> SUCCESS|FAILED regardless of whether that
 * request runs synchronously (small scope) or is dispatched onto the queue
 * (large scope) — see RecalculateAttendanceJob. Mirrors the exact pattern
 * already established for `attendance_sync_logs`. Purely additive: a new
 * table only, no change to any existing schema.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('attendance_recalculation_jobs')) {
            return;
        }

        Schema::create('attendance_recalculation_jobs', function (Blueprint $table) {
            $table->id();
            $table->string('company_code')->nullable();
            $table->string('unit')->nullable();
            $table->string('department')->nullable();
            $table->foreignId('employee_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->date('date_from');
            $table->date('date_to');
            $table->string('mode')->default('sync'); // sync | queued
            $table->string('status')->default('RUNNING'); // RUNNING | SUCCESS | FAILED
            $table->unsignedInteger('processed_count')->default(0);
            $table->unsignedInteger('days_count')->default(0);
            $table->unsignedInteger('employees_count')->default(0);
            $table->text('error_message')->nullable();
            $table->foreignId('triggered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('started_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->index('status');
            $table->index(['company_code', 'unit', 'department']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_recalculation_jobs');
    }
};
