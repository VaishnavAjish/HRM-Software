<?php

use App\Services\Biometric\EsslBiometricService;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — Phase 0, step 1.
 *
 * `attendance_devices` — the machine registry (Attendance Engine spec §24,
 * §62). Purely additive: nothing existing reads or writes this table yet,
 * so this migration cannot change any current behaviour. It is seeded from
 * `EsslBiometricService::DEVICE_SERIALS` (the SAME constant the sync already
 * hard-codes) so there is one source of truth for the 28 machine serials —
 * not a second, driftable copy.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('attendance_devices')) {
            Schema::create('attendance_devices', function (Blueprint $table) {
                $table->id();
                $table->string('serial_number')->unique();
                $table->string('name')->nullable();
                $table->string('ip_address')->nullable();
                $table->string('company_code')->nullable();
                $table->string('unit')->nullable();
                $table->string('location')->nullable();
                $table->string('status')->default('unknown'); // online, offline, unknown
                $table->boolean('is_active')->default(true);
                $table->timestamp('last_sync_at')->nullable();
                $table->timestamp('last_successful_sync_at')->nullable();
                $table->text('last_sync_error')->nullable();
                $table->unsignedInteger('last_sync_punch_count')->nullable();
                $table->timestamps();

                $table->index(['company_code', 'unit']);
                $table->index('is_active');
            });
        }

        // Idempotent seed: safe to run again, never overwrites an admin's
        // later edit (company_code/unit/name) because it only inserts rows
        // that don't already exist by serial_number.
        if (class_exists(EsslBiometricService::class)) {
            $now = now();
            $rows = array_map(
                fn (string $serial) => [
                    'serial_number' => $serial,
                    'name' => null,
                    'status' => 'unknown',
                    'is_active' => true,
                    'created_at' => $now,
                    'updated_at' => $now,
                ],
                EsslBiometricService::DEVICE_SERIALS
            );
            DB::table('attendance_devices')->insertOrIgnore($rows);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_devices');
    }
};
