<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — Phase 2/4.
 *
 * `attendance_sync_logs` — one row per sync RUN (spec §26's Sync History
 * page), separate from `attendance_devices.last_sync_at` (which only ever
 * holds the single latest timestamp per machine) and from the generic
 * `upload_batches` table (already used for one audit row per sync covering
 * ALL devices together — this table is per-device, per-run, so a run across
 * 28 machines produces up to 28 rows, one per device, letting the Sync
 * History page show which specific machines succeeded/failed/were partial).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('attendance_sync_logs')) {
            return;
        }

        Schema::create('attendance_sync_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sync_batch_id')->nullable()->constrained('upload_batches')->nullOnDelete();
            $table->foreignId('device_id')->nullable()->constrained('attendance_devices')->nullOnDelete();
            $table->string('device_serial')->nullable(); // kept even if device_id can't resolve
            $table->string('company_code')->nullable();
            $table->timestamp('started_at');
            $table->timestamp('completed_at')->nullable();
            $table->string('status')->default('RUNNING'); // RUNNING | SUCCESS | PARTIAL | FAILED
            $table->unsignedInteger('fetched_count')->default(0);
            $table->unsignedInteger('inserted_count')->default(0);
            $table->unsignedInteger('duplicate_count')->default(0);
            $table->unsignedInteger('unmapped_count')->default(0);
            $table->unsignedInteger('failed_count')->default(0);
            $table->text('error_message')->nullable();
            $table->foreignId('triggered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('trigger_type')->default('manual'); // manual | scheduled
            $table->timestamps();

            $table->index(['device_id', 'started_at']);
            $table->index('status');
            $table->index('sync_batch_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_sync_logs');
    }
};
