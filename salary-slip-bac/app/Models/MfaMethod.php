<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * MFA Method — Domain 01.3 Multi-Factor Authentication.
 *
 * Stores enrolled MFA methods per user. Supports multiple enrolled methods
 * per user with different types (TOTP, SMS, Email, Push, Security Key, Backup Codes).
 */
class MfaMethod extends Model
{
    protected $fillable = [
        'user_id',
        'type', // 'totp', 'sms', 'email', 'push', 'security_key', 'backup_codes'
        'name', // User-friendly name (e.g., "Authenticator App", "iPhone 15")
        'secret', // Encrypted secret for TOTP
        'phone_number', // For SMS
        'email', // For email OTP
        'device_info', // JSON: device fingerprint, browser, OS
        'is_primary',
        'is_active',
        'last_used_at',
        'enrolled_at',
        'backup_codes', // Encrypted array of backup codes (for backup_codes type)
    ];

    protected $casts = [
        'is_primary' => 'boolean',
        'is_active' => 'boolean',
        'last_used_at' => 'datetime',
        'enrolled_at' => 'datetime',
        'device_info' => 'array',
        'backup_codes' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function scopeActive($query)
    {
        return $query->where('is_active', true);
    }

    public function scopePrimary($query)
    {
        return $query->where('is_primary', true);
    }

    public function scopeByType($query, string $type)
    {
        return $query->where('type', $type);
    }

    public function getTypeLabel(): string
    {
        return match ($this->type) {
            'totp' => 'Authenticator App',
            'sms' => 'SMS OTP',
            'email' => 'Email OTP',
            'push' => 'Push Notification',
            'security_key' => 'Security Key',
            'backup_codes' => 'Backup Codes',
            default => $this->type,
        };
    }

    public function isTotp(): bool
    {
        return $this->type === 'totp';
    }

    public function isSms(): bool
    {
        return $this->type === 'sms';
    }

    public function isEmail(): bool
    {
        return $this->type === 'email';
    }

    public function isPush(): bool
    {
        return $this->type === 'push';
    }

    public function isSecurityKey(): bool
    {
        return $this->type === 'security_key';
    }

    public function isBackupCodes(): bool
    {
        return $this->type === 'backup_codes';
    }
}