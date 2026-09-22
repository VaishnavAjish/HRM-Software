<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — Phase 1.
 *
 * `attendance_rules` — the full company -> branch -> department -> employee
 * hierarchy (spec §6-§10) as ONE table, not five (`attendance_company_rules`,
 * `attendance_branch_rules`, `attendance_department_rules`,
 * `attendance_employee_rules` as literally named in spec §43). Deliberate
 * design choice, not an oversight of the spec: the five would be five
 * near-identical column sets that can drift apart; one table with a
 * `scope_type` discriminator (exactly the pattern this codebase ALREADY uses
 * for `leave_policies.scope_type`/`scope_id`) gives the same hierarchy with
 * one resolver, one migration to extend later, and one audit trail.
 *
 * Versioning (spec §45) is `effective_from`/`effective_to`: a rule change
 * NEVER updates an existing row's numbers — it inserts a new row with a
 * later `effective_from` (and, ideally, sets the superseded row's
 * `effective_to` the day before). `AttendanceRuleResolver` always resolves
 * "the rule in force ON THE ATTENDANCE DATE being calculated", so a
 * September calculation keeps using September's numbers even after an
 * October change is entered — see `AttendanceRuleResolver`'s docblock.
 *
 * Per-field nullability is intentional: an employee-scope row only needs to
 * set the ONE field it's overriding (e.g. just `grace_in_minutes`); every
 * other field falls through to the next broader scope. `shift_id` lets a
 * rule also carry a default shift assignment for its scope (spec §8's
 * "department rule: default shift").
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('attendance_rules')) {
            return;
        }

        Schema::create('attendance_rules', function (Blueprint $table) {
            $table->id();

            $table->string('scope_type'); // global | company | branch | department | employee
            $table->string('company_code')->nullable(); // required for company/branch/department/employee scopes
            $table->string('unit')->nullable();          // required for branch scope (and narrows department/employee)
            $table->string('department')->nullable();    // matches users.department (free-text, see docblock note below)
            $table->foreignId('employee_user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('shift_id')->nullable()->constrained('shifts')->nullOnDelete();

            $table->string('name')->nullable(); // admin-facing label, e.g. "HR Dept — Sept 2026"

            // Every field nullable: null = "not overridden at this scope,
            // fall through". See AttendanceRuleResolver.
            $table->unsignedInteger('grace_in_minutes')->nullable();
            $table->unsignedInteger('grace_out_minutes')->nullable();
            $table->unsignedInteger('late_threshold_minutes')->nullable();      // beyond grace before is_late
            $table->unsignedInteger('early_exit_threshold_minutes')->nullable();
            $table->unsignedInteger('half_day_threshold_minutes')->nullable();
            $table->unsignedInteger('minimum_work_minutes')->nullable();
            $table->unsignedInteger('full_day_minutes')->nullable();
            $table->boolean('overtime_enabled')->nullable();
            $table->unsignedInteger('overtime_after_minutes')->nullable();
            $table->string('break_policy')->nullable(); // first_last | multi_punch
            $table->jsonb('weekly_off_days')->nullable(); // [0..6]
            $table->boolean('biometric_required')->nullable();
            $table->boolean('manual_attendance_allowed')->nullable();
            $table->boolean('attendance_exempt')->nullable(); // e.g. field-work/WFH-only roles

            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('change_reason')->nullable();
            $table->timestamps();

            $table->index(['scope_type', 'company_code', 'unit', 'department']);
            $table->index('employee_user_id');
            $table->index(['effective_from', 'effective_to']);
            $table->index('is_active');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_rules');
    }
};
