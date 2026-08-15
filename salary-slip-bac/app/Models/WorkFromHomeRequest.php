<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class WorkFromHomeRequest extends Model
{
    use SoftDeletes;

    protected $table = 'work_from_home_requests';

    protected $fillable = [
        'request_number',
        'user_id',
        'leave_type_id',
        'leave_policy_id',
        'start_date',
        'end_date',
        'total_days',
        'is_recurring',
        'recurrence_pattern',
        'reason',
        'work_location',
        'contact_number',
        'emergency_contact',
        'equipment_taken',
        'status',
        'workflow_stage',
        'approval_chain',
        'approval_history',
        'submitted_by',
        'submitted_at',
        'approved_by',
        'approved_at',
        'rejected_by',
        'rejected_at',
        'rejection_reason',
        'cancelled_by',
        'cancelled_at',
        'cancellation_reason',
        'requires_check_in',
        'check_in_schedule',
        'metadata',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'total_days' => 'decimal:2',
        'is_recurring' => 'boolean',
        'recurrence_pattern' => 'array',
        'equipment_taken' => 'array',
        'approval_chain' => 'array',
        'approval_history' => 'array',
        'submitted_at' => 'datetime',
        'approved_at' => 'datetime',
        'rejected_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'requires_check_in' => 'boolean',
        'check_in_schedule' => 'array',
        'metadata' => 'array',
        'deleted_at' => 'datetime',
    ];

    public const STATUSES = [
        'draft' => 'Draft',
        'submitted' => 'Submitted',
        'pending' => 'Pending Approval',
        'approved' => 'Approved',
        'rejected' => 'Rejected',
        'cancelled' => 'Cancelled',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }

    public function leavePolicy(): BelongsTo
    {
        return $this->belongsTo(LeavePolicy::class);
    }

    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function rejectedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'rejected_by');
    }

    public function cancelledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }

    public function checkIns(): HasMany
    {
        return $this->hasMany(WfhCheckIn::class);
    }

    public function scopeDraft($query)
    {
        return $query->where('status', 'draft');
    }

    public function scopeSubmitted($query)
    {
        return $query->where('status', 'submitted');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    public function scopeActive($query)
    {
        return $query->whereIn('status', ['submitted', 'pending', 'approved']);
    }

    public function scopeForUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeForDateRange($query, $startDate, $endDate)
    {
        return $query->where(function ($q) use ($startDate, $endDate) {
            $q->whereBetween('start_date', [$startDate, $endDate])
                ->orWhereBetween('end_date', [$startDate, $endDate])
                ->orWhere(function ($q2) use ($startDate, $endDate) {
                    $q2->where('start_date', '<=', $startDate)
                        ->where('end_date', '>=', $endDate);
                });
        });
    }

    public function getStatusLabelAttribute(): string
    {
        return self::STATUSES[$this->status] ?? $this->status;
    }

    public function isEditable(): bool
    {
        return in_array($this->status, ['draft', 'submitted']);
    }

    public function isCancellable(): bool
    {
        return in_array($this->status, ['draft', 'submitted', 'pending', 'approved']);
    }

    public function submit(): void
    {
        if ($this->status !== 'draft') {
            throw new \Exception('Only draft requests can be submitted');
        }

        $this->status = 'submitted';
        $this->submitted_at = now();
        $this->submitted_by = auth()->id();
        $this->save();
    }

    public function approve($approverId = null): void
    {
        if (!in_array($this->status, ['submitted', 'pending'])) {
            throw new \Exception('Only submitted/pending requests can be approved');
        }

        $this->status = 'approved';
        $this->approved_at = now();
        $this->approved_by = $approverId ?? auth()->id();
        $this->save();
    }

    public function reject($rejectorId = null, $reason = null): void
    {
        if (!in_array($this->status, ['submitted', 'pending'])) {
            throw new \Exception('Only submitted/pending requests can be rejected');
        }

        $this->status = 'rejected';
        $this->rejected_at = now();
        $this->rejected_by = $rejectorId ?? auth()->id();
        $this->rejection_reason = $reason;
        $this->save();
    }

    public function cancel($cancellerId = null, $reason = null): void
    {
        if (!in_array($this->status, ['draft', 'submitted', 'pending', 'approved'])) {
            throw new \Exception('Request cannot be cancelled in current status');
        }

        $this->status = 'cancelled';
        $this->cancelled_at = now();
        $this->cancelled_by = $cancellerId ?? auth()->id();
        $this->cancellation_reason = $reason;
        $this->save();
    }
}