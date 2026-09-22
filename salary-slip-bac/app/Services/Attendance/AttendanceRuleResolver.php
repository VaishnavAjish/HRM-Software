<?php

namespace App\Services\Attendance;

use App\Models\AttendanceRule;
use App\Models\Shift;
use App\Models\User;
use Illuminate\Support\Carbon;

/**
 * Attendance Engine Rebuild — Phase 1.
 *
 * Resolves the applicable attendance rule for one employee on one date,
 * following the hierarchy spec §6 mandates: employee -> department ->
 * branch -> company -> global default, most specific wins. Implemented as
 * a PER-FIELD cascade (not whole-row override): an employee-scope row that
 * only sets `grace_in_minutes` still inherits every other field from
 * whichever broader scope defines it — this reproduces the spec's own
 * worked example exactly (employee grace=20 beats department's 15 beats
 * company's 10) while also supporting a genuinely partial override, which
 * a strict "most specific ROW wins entirely" reading would not.
 *
 * Versioning (spec §45): only rows whose `effective_from <= $date` and
 * (`effective_to` is null or `>= $date`) are ever considered, so a
 * September recalculation always uses September's numbers even after an
 * October change is entered — recalculating September again later still
 * reproduces the same result.
 */
class AttendanceRuleResolver
{
    private const FIELDS = [
        'grace_in_minutes', 'grace_out_minutes', 'late_threshold_minutes',
        'early_exit_threshold_minutes', 'half_day_threshold_minutes', 'minimum_work_minutes',
        'full_day_minutes', 'overtime_enabled', 'overtime_after_minutes', 'break_policy',
        'weekly_off_days', 'biometric_required', 'manual_attendance_allowed', 'attendance_exempt',
        'shift_id',
    ];

    /** The floor every field falls back to if NO scope, including global, ever sets it. */
    private const HARD_DEFAULTS = [
        'grace_in_minutes' => 10,
        'grace_out_minutes' => 0,
        'late_threshold_minutes' => 0,
        'early_exit_threshold_minutes' => 0,
        'half_day_threshold_minutes' => 240,
        'minimum_work_minutes' => 60,
        'full_day_minutes' => 480,
        'overtime_enabled' => false,
        'overtime_after_minutes' => null,
        'break_policy' => 'first_last',
        'weekly_off_days' => [0], // Sunday
        'biometric_required' => true,
        'manual_attendance_allowed' => false,
        'attendance_exempt' => false,
        'shift_id' => null,
    ];

    /**
     * @return array{values: array, sources: array<string,string>, rule_ids: array<string,?int>}
     *   `sources[$field]` is one of AttendanceRule::SCOPE_* or 'default' —
     *   this is what makes the calculation explainable (spec §6, §31): the
     *   UI can show exactly which level decided each number.
     */
    public function resolve(User $employee, Carbon $date): array
    {
        $dateStr = $date->toDateString();
        $department = $employee->department;

        // One query per scope level (cheap — at most a handful of active
        // rule rows exist per scope in practice), each already filtered to
        // "in force on this date" and ordered so the most recently created
        // matching row wins if more than one somehow overlaps.
        $candidates = [
            AttendanceRule::SCOPE_EMPLOYEE => $this->latestMatch(
                fn ($q) => $q->where('scope_type', AttendanceRule::SCOPE_EMPLOYEE)->where('employee_user_id', $employee->id),
                $dateStr
            ),
            AttendanceRule::SCOPE_DEPARTMENT => $department ? $this->latestMatch(
                fn ($q) => $q->where('scope_type', AttendanceRule::SCOPE_DEPARTMENT)
                    ->where('company_code', $employee->company_code)
                    ->where('department', $department),
                $dateStr
            ) : null,
            AttendanceRule::SCOPE_BRANCH => $employee->unit ? $this->latestMatch(
                fn ($q) => $q->where('scope_type', AttendanceRule::SCOPE_BRANCH)
                    ->where('company_code', $employee->company_code)
                    ->where('unit', $employee->unit),
                $dateStr
            ) : null,
            AttendanceRule::SCOPE_COMPANY => $this->latestMatch(
                fn ($q) => $q->where('scope_type', AttendanceRule::SCOPE_COMPANY)->where('company_code', $employee->company_code),
                $dateStr
            ),
            AttendanceRule::SCOPE_GLOBAL => $this->latestMatch(
                fn ($q) => $q->where('scope_type', AttendanceRule::SCOPE_GLOBAL),
                $dateStr
            ),
        ];

        $values = [];
        $sources = [];
        $ruleIds = [];

        foreach (self::FIELDS as $field) {
            $resolved = false;
            foreach (AttendanceRule::SCOPE_PRECEDENCE as $scope) {
                $rule = $candidates[$scope] ?? null;
                if ($rule && $rule->{$field} !== null) {
                    $values[$field] = $rule->{$field};
                    $sources[$field] = $scope;
                    $ruleIds[$field] = $rule->id;
                    $resolved = true;
                    break;
                }
            }
            if (! $resolved) {
                $values[$field] = self::HARD_DEFAULTS[$field];
                $sources[$field] = 'default';
                $ruleIds[$field] = null;
            }
        }

        // Resolve the actual Shift row: employee's assigned shift wins over
        // whatever scope-level default shift_id the rule cascade produced.
        $shift = $employee->shift_id
            ? Shift::find($employee->shift_id)
            : ($values['shift_id'] ? Shift::find($values['shift_id']) : null);

        return [
            'values' => $values,
            'sources' => $sources,
            'rule_ids' => $ruleIds,
            'shift' => $shift,
            'matched_rules' => array_filter($candidates),
        ];
    }

    private function latestMatch(callable $scopeCallback, string $dateStr): ?AttendanceRule
    {
        $query = AttendanceRule::query()
            ->where('is_active', true)
            ->where('effective_from', '<=', $dateStr)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>=', $dateStr));

        $scopeCallback($query);

        return $query->orderByDesc('effective_from')->orderByDesc('id')->first();
    }
}
