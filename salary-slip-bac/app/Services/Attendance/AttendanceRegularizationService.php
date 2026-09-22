<?php

namespace App\Services\Attendance;

use App\Models\AttendanceAuditLog;
use App\Models\AttendanceDaily;
use App\Models\AttendanceRegularization;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Attendance Engine Rebuild — Phase 2.
 *
 * Manual regularization workflow (spec §19): request -> approve/reject ->
 * (on approval) recalculate. The raw punch ledger is never touched by any
 * of this — see AttendanceRecalculationService's docblock for how an
 * approved regularization is applied as an input, not a mutation.
 */
class AttendanceRegularizationService
{
    public function __construct(
        private readonly AttendanceRecalculationService $recalculator = new AttendanceRecalculationService(),
    ) {
    }

    public function request(
        User $employee,
        Carbon $date,
        User $requestedBy,
        string $field,
        ?Carbon $newCheckIn,
        ?Carbon $newCheckOut,
        ?string $newStatus,
        string $reason
    ): AttendanceRegularization {
        if (mb_strlen(trim($reason)) < 5) {
            throw ValidationException::withMessages(['reason' => 'A substantive reason of at least 5 characters is required.']);
        }

        $daily = AttendanceDaily::query()
            ->where('user_id', $employee->id)
            ->whereDate('attendance_date', $date->toDateString())
            ->first();

        $reg = AttendanceRegularization::create([
            'user_id' => $employee->id,
            'attendance_date' => $date->toDateString(),
            'attendance_daily_id' => $daily?->id,
            'field' => $field,
            'original_check_in' => $daily?->first_punch_at,
            'original_check_out' => $daily?->last_punch_at,
            'new_check_in' => $newCheckIn,
            'new_check_out' => $newCheckOut,
            'original_status' => $daily?->primary_status,
            'new_status' => $newStatus,
            'reason' => $reason,
            'approval_status' => AttendanceRegularization::STATUS_PENDING,
            'requested_by' => $requestedBy->id,
            'ip_address' => request()?->ip(),
        ]);

        AttendanceAuditLog::record($requestedBy, 'REGULARIZATION_REQUESTED', 'attendance_regularization', $reg->id, null, $reg->toArray(), $reason);

        return $reg;
    }

    public function decide(AttendanceRegularization $reg, User $approver, bool $approve, ?string $remarks = null): AttendanceRegularization
    {
        if ($reg->approval_status !== AttendanceRegularization::STATUS_PENDING) {
            throw ValidationException::withMessages(['status' => 'This regularization has already been decided.']);
        }

        return DB::transaction(function () use ($reg, $approver, $approve, $remarks) {
            $before = $reg->toArray();

            $reg->approval_status = $approve ? AttendanceRegularization::STATUS_APPROVED : AttendanceRegularization::STATUS_REJECTED;
            $reg->approved_by = $approver->id;
            $reg->approved_at = now();
            $reg->approval_remarks = $remarks;
            $reg->save();

            AttendanceAuditLog::record(
                $approver,
                $approve ? 'REGULARIZATION_APPROVED' : 'REGULARIZATION_REJECTED',
                'attendance_regularization',
                $reg->id,
                $before,
                $reg->fresh()->toArray(),
                $remarks
            );

            if ($approve) {
                $employee = User::find($reg->user_id);
                if ($employee) {
                    $this->recalculator->recalculateOne($employee, Carbon::parse($reg->attendance_date));
                }
            }

            return $reg->fresh();
        });
    }
}
