<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Security Policy — Domain 01.12 Security Policies.
 *
 * Centralized security policy configuration for the application.
 * Supports password policies, IP restrictions, geo restrictions, etc.
 */
class SecurityPolicy extends Model
{
    protected $fillable = [
        'name',
        'code',
        'description',
        'type', // 'password', 'ip', 'geo', 'network', 'device', 'country', 'risk', 'brute_force', 'credential_stuffing'
        'configuration', // JSON configuration
        'scope', // 'global', 'tenant', 'company', 'role', 'user'
        'scope_id', // ID for scoped policies
        'is_active',
        'priority', // Higher priority wins
        'effective_from',
        'effective_to',
    ];

    protected $casts = [
        'configuration' => 'array',
        'is_active' => 'boolean',
        'priority' => 'integer',
        'effective_from' => 'date',
        'effective_to' => 'date',
    ];

    public function scopeActive($query)
    {
        return $query->where('is_active', true)
            ->where(function ($q) {
                $q->whereNull('effective_from')
                    ->orWhere('effective_from', '<=', now());
            })
            ->where(function ($q) {
                $q->whereNull('effective_to')
                    ->orWhere('effective_to', '>=', now());
            });
    }

    public function scopeByType($query, string $type)
    {
        return $query->where('type', $type);
    }

    public function scopeForScope($query, string $scope, ?int $scopeId = null)
    {
        return $query->where('scope', $scope)
            ->where(function ($q) use ($scopeId) {
                $q->whereNull('scope_id')
                    ->orWhere('scope_id', $scopeId);
            });
    }

    public function isEffectiveNow(): bool
    {
        if (!$this->is_active) {
            return false;
        }

        if ($this->effective_from && now()->lt($this->effective_from)) {
            return false;
        }

        if ($this->effective_to && now()->gt($this->effective_to)) {
            return false;
        }

        return true;
    }

    public function getConfig(string $key, $default = null)
    {
        return $this->configuration[$key] ?? $default;
    }
}