<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Access Review — Domain 01.20 Access Review.
 *
 * Tracks periodic access reviews for users, roles, and permissions.
 * Supports manager review, HR review, application owner review, and privileged access review.
 */
class AccessReview extends Model
{
    protected $fillable = [
        'name',
        'description',
        'type', // 'periodic', 'manager', 'hr', 'application_owner', 'privileged'
        'scope_type', // 'tenant', 'company', 'department', 'role', 'user', 'global'
        'scope_id',
        'status', // 'draft', 'in_progress', 'completed', 'cancelled'
        'reviewer_type', // 'manager', 'hr', 'application_owner', 'super_admin'
        'reviewer_id', // Specific reviewer if not determined by type
        'frequency', // 'monthly', 'quarterly', 'semi_annual', 'annual', 'ad_hoc'
        'start_date',
        'end_date',
        'completed_at',
        'created_by',
        'metadata', // Additional configuration
    ];

    protected $casts = [
        'metadata' => 'array',
        'start_date' => 'date',
        'end_date' => 'date',
        'completed_at' => 'datetime',
    ];

    public function items()
    {
        return $this->hasMany(AccessReviewItem::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }

    public function scopeActive($query)
    {
        return $query->whereIn('status', ['in_progress', 'draft']);
    }

    public function scopeOverdue($query)
    {
        return $query->where('status', 'in_progress')
            ->where('end_date', '<', now());
    }

    public function isOverdue(): bool
    {
        return $this->status === 'in_progress' && $this->end_date && now()->gt($this->end_date);
    }

    public function getProgress(): array
    {
        $total = $this->items()->count();
        $reviewed = $this->items()->whereNotNull('decision')->count();
        $approved = $this->items()->where('decision', 'approve')->count();
        $revoked = $this->items()->where('decision', 'revoke')->count();
        $modified = $this->items()->where('decision', 'modify')->count();

        return [
            'total' => $total,
            'reviewed' => $reviewed,
            'pending' => $total - $reviewed,
            'approved' => $approved,
            'revoked' => $revoked,
            'modified' => $modified,
            'percentage' => $total > 0 ? round(($reviewed / $total) * 100, 1) : 0,
        ];
    }
}