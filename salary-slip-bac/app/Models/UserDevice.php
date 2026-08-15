<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * User Device — Domain 01.11 Device Management.
 *
 * Tracks registered/trusted/blocked devices for a user.
 * Separate from sessions - devices persist across sessions.
 */
class UserDevice extends Model
{
    protected $fillable = [
        'user_id',
        'device_id', // Device fingerprint
        'device_name', // User-friendly name
        'browser', // Browser info
        'os', // Operating system
        'device_type', // 'desktop', 'mobile', 'tablet'
        'is_trusted', // Trusted device
        'is_blocked', // Blocked device
        'first_seen_at', // First login from this device
        'last_seen_at', // Last activity from this device
        'trusted_at', // When marked as trusted
        'trusted_by', // Who marked as trusted
        'blocked_at', // When blocked
        'blocked_by', // Who blocked
        'block_reason', // Reason for blocking
        'login_count', // Number of logins from this device
    ];

    protected $casts = [
        'is_trusted' => 'boolean',
        'is_blocked' => 'boolean',
        'first_seen_at' => 'datetime',
        'last_seen_at' => 'datetime',
        'trusted_at' => 'datetime',
        'blocked_at' => 'datetime',
        'login_count' => 'integer',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function trustedBy()
    {
        return $this->belongsTo(User::class, 'trusted_by');
    }

    public function blockedBy()
    {
        return $this->belongsTo(User::class, 'blocked_by');
    }

    public function scopeTrusted($query)
    {
        return $query->where('is_trusted', true)->where('is_blocked', false);
    }

    public function scopeBlocked($query)
    {
        return $query->where('is_blocked', true);
    }

    public function scopeActive($query)
    {
        return $query->where('is_blocked', false);
    }

    public function isTrusted(): bool
    {
        return $this->is_trusted && !$this->is_blocked;
    }

    public function isBlocked(): bool
    {
        return $this->is_blocked;
    }

    public function recordLogin(): void
    {
        $this->login_count++;
        $this->last_seen_at = now();
        if (!$this->first_seen_at) {
            $this->first_seen_at = now();
        }
        $this->save();
    }

    public function trust(?User $trustedBy = null): void
    {
        $this->is_trusted = true;
        $this->is_blocked = false;
        $this->trusted_at = now();
        $this->trusted_by = $trustedBy?->id;
        $this->blocked_at = null;
        $this->blocked_by = null;
        $this->block_reason = null;
        $this->save();
    }

    public function block(?User $blockedBy = null, string $reason = 'user_blocked'): void
    {
        $this->is_blocked = true;
        $this->is_trusted = false;
        $this->blocked_at = now();
        $this->blocked_by = $blockedBy?->id;
        $this->block_reason = $reason;
        $this->trusted_at = null;
        $this->trusted_by = null;
        $this->save();
    }

    public function unblock(): void
    {
        $this->is_blocked = false;
        $this->blocked_at = null;
        $this->blocked_by = null;
        $this->block_reason = null;
        $this->save();
    }
}