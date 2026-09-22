<?php

namespace Database\Seeders;

use App\Models\AttendanceRule;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — example/starter rules (spec §71 deliverable
 * #10). Idempotent (firstOrCreate keyed on the same columns a real
 * duplicate would collide on) and deliberately conservative: one global
 * default, one example per company, matching the spec's own worked
 * examples (§10's Nidhi Impex numbers, §6's grace-hierarchy example) — not
 * real, opinionated company policy. HR replaces/extends these through the
 * Attendance Settings screen once the module is live; this only guarantees
 * the hierarchy is never completely empty on a fresh deployment.
 */
class AttendanceRuleExampleSeeder extends Seeder
{
    public function run(): void
    {
        if (! Schema::hasTable('attendance_rules')) {
            return;
        }

        AttendanceRule::firstOrCreate(
            ['scope_type' => AttendanceRule::SCOPE_GLOBAL, 'company_code' => null, 'effective_from' => '2020-01-01'],
            [
                'name' => 'Global default',
                'grace_in_minutes' => 10, 'grace_out_minutes' => 0,
                'half_day_threshold_minutes' => 240, 'full_day_minutes' => 480, 'minimum_work_minutes' => 60,
                'overtime_enabled' => false, 'break_policy' => 'first_last',
                'weekly_off_days' => [0], 'biometric_required' => true, 'is_active' => true,
            ]
        );

        // Spec §10's own worked example.
        AttendanceRule::firstOrCreate(
            ['scope_type' => AttendanceRule::SCOPE_COMPANY, 'company_code' => 'nidhi-impex', 'effective_from' => '2020-01-01'],
            [
                'name' => 'Nidhi Impex — company default',
                'grace_in_minutes' => 10, 'grace_out_minutes' => 10,
                'half_day_threshold_minutes' => 240, 'full_day_minutes' => 480, 'minimum_work_minutes' => 60,
                'overtime_enabled' => true, 'overtime_after_minutes' => 480, 'break_policy' => 'first_last',
                'weekly_off_days' => [0], 'is_active' => true,
            ]
        );

        AttendanceRule::firstOrCreate(
            ['scope_type' => AttendanceRule::SCOPE_COMPANY, 'company_code' => 'silver-star', 'effective_from' => '2020-01-01'],
            [
                'name' => 'Silver Star — company default',
                'grace_in_minutes' => 10, 'grace_out_minutes' => 10,
                'half_day_threshold_minutes' => 240, 'full_day_minutes' => 480, 'minimum_work_minutes' => 60,
                'overtime_enabled' => true, 'overtime_after_minutes' => 480, 'break_policy' => 'first_last',
                'weekly_off_days' => [0], 'is_active' => true,
            ]
        );

        // Spec §8's department examples — Production gets a tighter grace,
        // HR a slightly later shift's worth of grace, both illustrative.
        AttendanceRule::firstOrCreate(
            ['scope_type' => AttendanceRule::SCOPE_DEPARTMENT, 'company_code' => 'nidhi-impex', 'department' => 'Production', 'effective_from' => '2020-01-01'],
            ['name' => 'Production department', 'grace_in_minutes' => 5, 'is_active' => true]
        );
        AttendanceRule::firstOrCreate(
            ['scope_type' => AttendanceRule::SCOPE_DEPARTMENT, 'company_code' => 'nidhi-impex', 'department' => 'HR', 'effective_from' => '2020-01-01'],
            ['name' => 'HR department', 'grace_in_minutes' => 15, 'is_active' => true]
        );
    }
}
