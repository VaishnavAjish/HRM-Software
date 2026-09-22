<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — Phase 1.
 *
 * `attendance_employee_code_map` — explicit support for one employee having
 * a DIFFERENT biometric user id on different machines (spec §23: "Employee
 * 0001, Machine A: User ID 1, Machine B: User ID 1001, both map to the same
 * employee"). The existing resolver (emp_code / punching_no / form_no / id,
 * with/without leading zeros — in both `AttendanceController::grid()` and
 * `EsslBiometricService`) only ever matches ONE code across every device;
 * this table is consulted FIRST, ahead of that fallback, by
 * `AttendancePunchIngestor` (a later edit, not yet wired — see its own
 * docblock) so a genuinely per-device code still resolves correctly.
 *
 * `device_id` nullable = the mapping applies on ANY device (the common
 * case — the employee's code just IS the same everywhere); a row with a
 * `device_id` set is a device-specific override.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('attendance_employee_code_map')) {
            return;
        }

        Schema::create('attendance_employee_code_map', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('device_id')->nullable()->constrained('attendance_devices')->cascadeOnDelete();
            $table->string('device_user_code'); // the biometric_user_id/device_user_id as that device reports it
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['device_id', 'device_user_code'], 'att_code_map_device_code_unique');
            $table->index('user_id');
        });

        // A plain unique(device_id, device_user_code) does NOT stop two
        // "applies to any device" rows (device_id NULL) from sharing the
        // same device_user_code — both Postgres and SQLite treat NULL as
        // distinct from NULL in a unique index. Same fix this codebase
        // already applies elsewhere (see users_company_emp_code_unique in
        // 2026_08_13_180000_add_user_id_to_salary_slips_and_attendances.php).
        $driver = DB::connection()->getDriverName();
        if ($driver === 'sqlite' || $driver === 'pgsql') {
            DB::statement(
                'CREATE UNIQUE INDEX IF NOT EXISTS att_code_map_null_device_code_unique '
                . 'ON attendance_employee_code_map (device_user_code) WHERE device_id IS NULL'
            );
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_employee_code_map');
    }
};
