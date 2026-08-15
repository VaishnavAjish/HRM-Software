<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveApproval extends Model
{
    use SoftDeletes;

    protected $table = 'leave_approvals';

    protected $fillable = [
        'leave_request_id',
        'stage',
        'sequence',
        'approver_id',
        'approver_role',
        'status',
        'comments',
        'decided_at',
        'delegated_to',
        'delegated_at',
        'delegation_reason',
        'is_mandatory',
        'can_skip',
        'conditions',
    ];

    protected $casts = [
        'decided_at' => 'datetime',
        'delegated_at' => 'datetime',
        'is_mandatory' => 'boolean',
        'can_skip' => 'boolean',
        'conditions' => 'array',
        'deleted_at' => 'datetime',
    ];

    public function leaveRequest(): BelongsTo
    {
        return $this->belongsTo(LeaveRequest::class);
    }

    public function approver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approver_id');
    }

    public function delegatedTo(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegated_to');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeApproved($query)
    {
        return $query->where('status', 'approved');
    }

    public function scopeRejected($query)
    {
        return $query->where('status', 'rejected');
    }

    public function scopeForStage($query, $stage)
    {
        return $query->where('stage', $stage);
    }

    public function scopeForApprover($query, $approverId)
    {
        return $query->where('approver_id', $approverId);
    }

    public function canBeDecidedBy($userId): bool
    {
        if ($this->approver_id === $userId) {
            return true;
        }

        if ($this->delegated_to === $userId) {
            return true;
        }

        return false;
    }

    public function approve($comments = null): void
    {
        $this->update([
            'status' => 'approved',
            'decided_at' => now(),
            'comments' => $comments,
        ]);
    }

    public function reject($comments = null): void
    {
        $this->update([
            'status' => 'rejected',
            'decided_at' => now(),
            'comments' => $comments,
        ]);
    }

    public function delegate($delegateId, $reason = null): void
    {
        $this->update([
            'delegated_to' => $delegateId,
            'delegated_at' => now(),
            'delegation_reason' => $reason,
            'status' => 'delegated',
        ]);
    }

    public function escalate(): void
    {
        $this->update([
            'status' => 'escalated',
        ]);
    }
}