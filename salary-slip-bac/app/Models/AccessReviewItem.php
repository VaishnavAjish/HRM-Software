<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Access Review Item — Domain 01.20 Access Review.
 *
 * Individual items within an access review.
 */
class AccessReviewItem extends Model
{
    protected $fillable = [
        'review_id',
        'user_id', // User being reviewed
        'role_id', // Role being reviewed
        'permission_id', // Permission being reviewed
        'scope_type', // 'tenant', 'company', 'department', 'global'
        'scope_id',
        'assignment_reason', // Why this access was granted
        'last_used_at', // When this access was last used
        'decision', // 'approve', 'revoke', 'modify', 'extend'
        'decision_reason', // Reason for decision
        'decided_by', // Who made the decision
        'decided_at', // When decision was made
        'new_role_id', // New role if modified
        'new_permissions', // New permissions if modified
        'new_scope_type', // New scope if modified
        'new_scope_id', // New scope ID if modified
        'expiry_date', // New expiry if extended
    ];

    protected $casts = [
        'new_permissions' => 'array',
        'last_used_at' => 'datetime',
        'decided_at' => 'datetime',
        'expiry_date' => 'date',
    ];

    public function review()
    {
        return $this->belongsTo(AccessReview::class, 'review_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function role()
    {
        return $this->belongsTo(Role::class, 'role_id');
    }

    public function permission()
    {
        return $this->belongsTo(Permission::class, 'permission_id');
    }

    public function decider()
    {
        return $this->belongsTo(User::class, 'decided_by');
    }

    public function newRole()
    {
        return $this->belongsTo(Role::class, 'new_role_id');
    }

    public function isDecided(): bool
    {
        return !is_null($this->decision);
    }

    public function isApproved(): bool
    {
        return $this->decision === 'approve';
    }

    public function isRevoked(): bool
    {
        return $this->decision === 'revoke';
    }

    public function isModified(): bool
    {
        return $this->decision === 'modify';
    }

    public function isExtended(): bool
    {
        return $this->decision === 'extend';
    }
}