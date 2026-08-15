<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * User Session — Domain 01.10 Session Management.
 *
 * Tracks active user sessions for management and revocation.
 * Supports concurrent session limits, idle timeout, and device tracking.
 */
class UserSession extends Model
{
    protected $fillable = [
        'user_id',
        'session_id', // JWT token identifier
        'device_id', // Device fingerprint
        'device_name', // User-friendly device name
        'browser', // Browser info
        'os', // Operating system
        'ip_address', // Login IP
        'location', // Geo location (city, country)
        'user_agent', // Full user agent string
        'auth_method', // 'password', 'otp', 'mfa', 'passkey', 'sso', 'magic_link'
        'mfa_verified', // Whether MFA was completed
        'is_current', // Is this the current session
        'is_trusted', // Trusted device
        'last_activity_at', // Last activity timestamp
        'expires_at', // Session expiry
        'revoked_at', // When revoked
        'revoked_by', // Who revoked (user_id or 'system')
        'revoke_reason', // Reason for revocation
    ];

    protected $casts = [
        'mfa_verified' => 'boolean',
        'is_current' => 'boolean',
        'is_trusted' => 'boolean',
        'last_activity_at' => 'datetime',
        'expires_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function revokedByUser()
    {
        return $this->belongsTo(User::class, 'revoked_by');
    }

    public function scopeActive($query)
    {
        return $query->where('is_current', true)
            ->where('revoked_at', null)
            ->where('expires_at', '>', now());
    }

    public function scopeForUser($query, int $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeTrusted($query)
    {
        return $query->where('is_trusted', true);
    }

    public function isExpired(): bool
    {
        return $this->expires_at && now()->gt($this->expires_at);
    }

    public function isRevoked(): bool
    {
        return $this->revoked_at !== null;
    }

    public function isActive(): bool
    {
        return $this->is_current && !$this->isRevoked() && !$this->isExpired();
    }

    public function getTimeRemaining(): int
    {
        if (!$this->expires_at) {
            return 0;
        }
        return max(0, now()->diffInSeconds($this->expires_at, false));
    }

    public function getIdleTime(): int
    {
        if (!$this->last_activity_at) {
            return 0;
        }
        return now()->diffInSeconds($this->last_activity_at, false);
    }
}