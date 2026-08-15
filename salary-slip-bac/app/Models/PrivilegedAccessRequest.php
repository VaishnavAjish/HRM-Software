<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Privileged Access Request — Domain 01.13 Privileged Access.
 *
 * Tracks break-glass, JIT access, and impersonation requests.
 * All privileged access must be requested, approved, and audited.
 */
class PrivilegedAccessRequest extends Model
{
    protected $fillable = [
        'requester_id', // User requesting access
        'target_user_id', // Target user (for impersonation)
        'type', // 'break_glass', 'jit', 'impersonation'
        'reason', // Justification
        'requested_role', // Role being requested (for break-glass/JIT)
        'requested_permissions', // Specific permissions (for JIT)
        'scope_type', // 'tenant', 'company', 'legal_entity', 'department', 'global'
        'scope_id', // Scope ID
        'status', // 'pending', 'approved', 'rejected', 'active', 'expired', 'revoked'
        'approved_by', // Approver user ID
        'approved_at', // Approval timestamp
        'activated_at', // When access was activated
        'expires_at', // When access expires
        'revoked_at', // When revoked
        'revoked_by', // Who revoked
        'revoke_reason', // Reason for revocation
        'metadata', // Additional context
    ];

    protected $casts = [
        'requested_permissions' => 'array',
        'metadata' => 'array',
        'approved_at' => 'datetime',
        'activated_at' => 'datetime',
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function requester()
    {
        return $this->belongsTo(User::class, 'requester_id');
    }

    public function targetUser()
    {
        return $this->belongsTo(User::class, 'target_user_id');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function revokedByUser()
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }

    public function scopePending($query)
    {
        return $query->where('status', 'pending');
    }

    public function scopeActive($query)
    {
        return $query->where('status', 'active')
            ->where('expires_at', '>', now());
    }

    public function scopeExpired($query)
    {
        return $query->where('status', 'expired')
            ->orWhere(function ($q) {
                $q->where('status', 'active')
                    ->where('expires_at', '<=', now());
            });
    }

    public function isPending(): bool
    {
        return $this->status === 'pending';
    }

    public function isApproved(): bool
    {
        return $this->status === 'approved';
    }

    public function isActive(): bool
    {
        return $this->status === 'active' && $this->expires_at && now()->lt($this->expires_at);
    }

    public function isExpired(): bool
    {
        return $this->status === 'expired' ||
            ($this->status === 'active' && $this->expires_at && now()->gte($this->expires_at));
    }

    public function isRevoked(): bool
    {
        return $this->status === 'revoked' || $this->revoked_at !== null;
    }

    public function approve(User $approver): void
    {
        $this->status = 'approved';
        $this->approved_by = $approver->id;
        $this->approved_at = now();
        $this->save();
    }

    public function activate(): void
    {
        $this->status = 'active';
        $this->activated_at = now();
        $this->save();
    }

    public function revoke(User $revokedBy, string $reason = 'revoked'): void
    {
        $this->status = 'revoked';
        $this->revoked_at = now();
        $this->revoked_by = $revokedBy->id;
        $this->revoke_reason = $reason;
        $this->save();
    }

    public function expire(): void
    {
        $this->status = 'expired';
        $this->save();
    }
}