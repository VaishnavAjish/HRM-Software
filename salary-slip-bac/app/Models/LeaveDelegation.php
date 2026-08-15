<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LeaveDelegation extends Model
{
    use SoftDeletes;

    protected $table = 'leave_delegations';

    protected $fillable = [
        'user_id',
        'delegate_id',
        'leave_type_id',
        'leave_policy_id',
        'start_date',
        'end_date',
        'reason',
        'status',
        'approved_by',
        'approved_at',
        'revoked_by',
        'revoked_at',
    ];

    protected $casts = [
        'start_date' => 'date',
        'end_date' => 'date',
        'approved_at' => 'datetime',
        'revoked_at' => 'datetime',
        'deleted_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function delegate(): BelongsTo
    {
        return $this->belongsTo(User::class, 'delegate_id');
    }

    public function leaveType(): BelongsTo
    {
        return $this->belongsTo(LeaveType::class);
    }

    public function leavePolicy(): BelongsTo
    {
        return $this->belongsTo(LeavePolicy::class);
    }

    public function approvedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function revokedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active');
    }

    public function scopeForUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeForDelegate($query, $delegateId)
    {
        return $query->where('delegate_id', $delegateId);
    }

    public function scopeEffective($query, $date = null)
    {
        $date = $date ?? now()->toDateString();
        return $query->where('start_date', '<=', $date)
            ->where('end_date', '>=', $date);
    }

    public function isActive(): bool
    {
        return $this->status === 'active'
            && $this->start_date <= now()->toDateString()
            && $this->end_date >= now()->toDateString();
    }

    public function canApprove($leaveRequest): bool
    {
        if (!$this->isActive()) {
            return false;
        }

        // Check leave type
        if ($this->leave_type_id && $this->leave_type_id !== $leaveRequest->leave_type_id) {
            return false;
        }

        // Check leave policy
        if ($this->leave_policy_id && $this->leave_policy_id !== $leaveRequest->leave_policy_id) {
            return false;
        }

        return true;
    }

    public function approve($approverId = null): void
    {
        $this->update([
            'status' => 'active',
            'approved_by' => $approverId ?? auth()->id(),
            'approved_at' => now(),
        ]);
    }

    public function revoke($revokerId = null): void
    {
        $this->update([
            'status' => 'revoked',
            'revoked_by' => $revokerId ?? auth()->id(),
            'revoked_at' => now(),
        ]);
    }
}