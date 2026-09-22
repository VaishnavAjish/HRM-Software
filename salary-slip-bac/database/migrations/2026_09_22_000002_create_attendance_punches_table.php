<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — Phase 0, step 2.
 *
 * `attendance_punches` — the permanent, append-only raw biometric ledger
 * (Attendance Engine spec §1-3, §43, §44, §66: "raw biometric punches are
 * the source of truth; attendance calculation is a derived layer"; "never
 * delete raw biometric records").
 *
 * Purely additive. `attendances` (the existing daily-summary table the
 * current AttendanceView.jsx page reads) is completely untouched by this
 * migration and keeps working exactly as it does today — this table is
 * written ALONGSIDE it by `AttendancePunchIngestor`, not instead of it.
 * A later phase's rule/recalculation engine will read FROM this table to
 * (re)produce the daily summary; nothing does that yet.
 *
 * `emp_code_raw`/`device_serial` are always stored as the device reported
 * them, even when they cannot be matched to a `users` row — see §61
 * ("if mapping is missing, DO NOT silently assign attendance... show
 * UNMAPPED BIOMETRIC USER"). `status` carries that as `UNMAPPED`.
 *
 * Idempotent sync (spec §25: "running sync twice must NOT create duplicate
 * attendance") is enforced at the database level by the unique index on
 * (device_serial, emp_code_raw, punch_datetime) — re-fetching the same
 * device window twice inserts the same row twice only as a no-op
 * (`insertOrIgnore`).
 *
 * `status` also carries the CONFIGURABLE duplicate-window result (spec §3):
 * VALID for the canonical punch, DUPLICATE for a later punch by the same
 * employee inside the configured window, pointing back via `duplicate_of`.
 * This is a *different* concept from the unique index above — the unique
 * index catches the exact same reported punch replayed by a re-sync;
 * `status=DUPLICATE` catches two genuinely different, close-together scans
 * (e.g. a device double-read) — and, unlike the unique index, NEVER removes
 * a row, only flags it.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('attendance_punches')) {
            return;
        }

        Schema::create('attendance_punches', function (Blueprint $table) {
            $table->id();

            // Raw, exactly as the device/source reported it — never mutated.
            $table->string('emp_code_raw');
            $table->string('device_serial')->nullable();
            $table->timestamp('punch_datetime');
            // Provisional calendar-day bucket = DATE(punch_datetime). This is
            // NOT yet the shift-aware "attendance day" the spec's overnight-
            // shift rule (§4) describes — that resolution needs the shift/
            // rule engine (a later phase) and will overwrite this column for
            // affected rows; `attendance_day_resolved` tracks whether that
            // has happened yet so nothing silently assumes it's final.
            $table->date('punch_date');
            $table->boolean('attendance_day_resolved')->default(false);
            $table->string('punch_type')->nullable(); // IN/OUT/BREAK/RETURN when the source supplies it (eSSL SOAP log does not)
            $table->string('source')->default('essl_biometric'); // essl_biometric | manual | import
            $table->text('raw_line')->nullable(); // the literal source line/record, for forensic traceability

            // Resolution — nullable: an unmapped punch is still stored (see docblock).
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('device_id')->nullable()->constrained('attendance_devices')->nullOnDelete();
            $table->string('company_code')->nullable();
            $table->string('unit')->nullable();

            // Sync provenance — reuses the existing upload_batches audit
            // infrastructure (the same table attendance-Excel-import and the
            // current eSSL sync already write to) rather than inventing a
            // second, parallel batch-history mechanism.
            $table->foreignId('sync_batch_id')->nullable()->constrained('upload_batches')->nullOnDelete();

            // VALID | DUPLICATE | UNMAPPED | INVALID
            $table->string('status')->default('VALID');
            $table->foreignId('duplicate_of')->nullable()->constrained('attendance_punches')->nullOnDelete();

            $table->timestamps();

            $table->unique(['device_serial', 'emp_code_raw', 'punch_datetime'], 'att_punches_idempotent_unique');
            $table->index(['user_id', 'punch_date']);
            $table->index(['company_code', 'unit', 'punch_date']);
            $table->index(['device_id', 'punch_datetime']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_punches');
    }
};
