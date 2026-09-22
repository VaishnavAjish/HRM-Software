<?php

namespace App\Http\Controllers\Api\V1\Attendance;

use App\Http\Controllers\Api\V1\Attendance\Concerns\RespondsWithEnvelope;
use App\Http\Controllers\Controller;
use App\Models\AttendanceAuditLog;
use App\Models\AttendanceRule;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * `GET,POST /v1/attendance/rules` — spec §32's Rule Management module.
 * A rule is never edited in place once past its effective_from (spec §45);
 * `update()` is deliberately absent — a change is always a new row.
 */
class AttendanceRuleController extends Controller
{
    use RespondsWithEnvelope;

    public function index(Request $request): JsonResponse
    {
        $query = AttendanceRule::query()->with(['shift:id,name', 'employee:id,name,emp_code']);

        if ($request->filled('scope_type')) {
            $query->where('scope_type', $request->query('scope_type'));
        }
        if ($request->filled('company_code')) {
            $query->where('company_code', $request->query('company_code'));
        }
        if (! $request->boolean('include_inactive')) {
            $query->where('is_active', true);
        }

        return $this->ok($query->orderByDesc('effective_from')->orderByDesc('id')->paginate(min((int) $request->query('per_page', 50), 200)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'scope_type' => ['required', Rule::in(AttendanceRule::SCOPE_PRECEDENCE)],
            'company_code' => ['required_unless:scope_type,global', 'nullable', 'string', 'max:60'],
            'unit' => ['required_if:scope_type,branch', 'nullable', 'string', 'max:120'],
            'department' => ['required_if:scope_type,department', 'nullable', 'string', 'max:120'],
            'employee_user_id' => ['required_if:scope_type,employee', 'nullable', 'integer', 'exists:users,id'],
            'shift_id' => ['sometimes', 'nullable', 'integer', 'exists:shifts,id'],
            'name' => ['sometimes', 'nullable', 'string', 'max:190'],
            'grace_in_minutes' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:600'],
            'grace_out_minutes' => ['sometimes', 'nullable', 'integer', 'min:0', 'max:600'],
            'late_threshold_minutes' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'early_exit_threshold_minutes' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'half_day_threshold_minutes' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'minimum_work_minutes' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'full_day_minutes' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'overtime_enabled' => ['sometimes', 'nullable', 'boolean'],
            'overtime_after_minutes' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'break_policy' => ['sometimes', 'nullable', Rule::in(['first_last', 'multi_punch'])],
            'weekly_off_days' => ['sometimes', 'nullable', 'array'],
            'weekly_off_days.*' => ['integer', 'min:0', 'max:6'],
            'biometric_required' => ['sometimes', 'nullable', 'boolean'],
            'manual_attendance_allowed' => ['sometimes', 'nullable', 'boolean'],
            'attendance_exempt' => ['sometimes', 'nullable', 'boolean'],
            'effective_from' => ['required', 'date'],
            'effective_to' => ['sometimes', 'nullable', 'date', 'after_or_equal:effective_from'],
            'change_reason' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);

        $actor = auth('api')->user();
        $data['created_by'] = $actor?->id;
        $data['is_active'] = true;

        $rule = AttendanceRule::create($data);

        AttendanceAuditLog::record($actor, 'RULE_CREATED', 'attendance_rule', $rule->id, null, $rule->toArray(), $data['change_reason'] ?? null);

        return $this->ok($rule->fresh(['shift', 'employee']), 201);
    }

    /** Soft-retire only — historical calculations that already froze this rule's snapshot are untouched. */
    public function destroy(int $rule): JsonResponse
    {
        $model = AttendanceRule::find($rule);
        if (! $model) {
            return $this->missing('Rule not found.');
        }

        $actor = auth('api')->user();
        $before = $model->toArray();
        $model->is_active = false;
        $model->effective_to = $model->effective_to ?? now()->toDateString();
        $model->save();

        AttendanceAuditLog::record($actor, 'RULE_RETIRED', 'attendance_rule', $model->id, $before, $model->fresh()->toArray());

        return $this->ok($model->fresh());
    }
}
