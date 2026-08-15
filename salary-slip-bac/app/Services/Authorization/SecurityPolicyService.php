<?php

namespace App\Services\Authorization;

use App\Models\SecurityPolicy;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

/**
 * Security Policy Service — Domain 01.12 Security Policies.
 *
 * Centralized service for evaluating security policies.
 * Supports password policies, IP restrictions, geo restrictions, etc.
 */
class SecurityPolicyService
{
    public const CACHE_TTL = 300; // 5 minutes

    /**
     * Get the effective password policy for a user.
     */
    public function getPasswordPolicy(User $user): array
    {
        $policies = $this->getApplicablePolicies($user, 'password');

        $config = [
            'min_length' => 8,
            'require_uppercase' => true,
            'require_lowercase' => true,
            'require_numbers' => true,
            'require_symbols' => true,
            'max_age_days' => 90,
            'history_count' => 5,
            'max_failed_attempts' => 5,
            'lockout_duration_minutes' => 30,
        ];

        foreach ($policies as $policy) {
            $config = array_merge($config, $policy->configuration ?? []);
        }

        return $config;
    }

    /**
     * Validate a password against the policy.
     */
    public function validatePassword(User $user, string $password): array
    {
        $policy = $this->getPasswordPolicy($user);
        $errors = [];

        if (strlen($password) < ($policy['min_length'] ?? 8)) {
            $errors[] = "Password must be at least {$policy['min_length']} characters";
        }

        if (($policy['require_uppercase'] ?? true) && !preg_match('/[A-Z]/', $password)) {
            $errors[] = 'Password must contain at least one uppercase letter';
        }

        if (($policy['require_lowercase'] ?? true) && !preg_match('/[a-z]/', $password)) {
            $errors[] = 'Password must contain at least one lowercase letter';
        }

        if (($policy['require_numbers'] ?? true) && !preg_match('/[0-9]/', $password)) {
            $errors[] = 'Password must contain at least one number';
        }

        if (($policy['require_symbols'] ?? true) && !preg_match('/[^A-Za-z0-9]/', $password)) {
            $errors[] = 'Password must contain at least one special character';
        }

        return [
            'valid' => empty($errors),
            'errors' => $errors,
            'policy' => $policy,
        ];
    }

    /**
     * Check if an IP is allowed.
     */
    public function isIpAllowed(User $user, string $ip): bool
    {
        $policies = $this->getApplicablePolicies($user, 'ip');

        foreach ($policies as $policy) {
            $config = $policy->configuration ?? [];
            $allowedIps = $config['allowed_ips'] ?? [];
            $blockedIps = $config['blocked_ips'] ?? [];

            if (!empty($allowedIps) && !in_array($ip, $allowedIps)) {
                return false;
            }

            if (in_array($ip, $blockedIps)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if a country is allowed.
     */
    public function isCountryAllowed(User $user, string $countryCode): bool
    {
        $policies = $this->getApplicablePolicies($user, 'country');

        foreach ($policies as $policy) {
            $config = $policy->configuration ?? [];
            $allowedCountries = $config['allowed_countries'] ?? [];
            $blockedCountries = $config['blocked_countries'] ?? [];

            if (!empty($allowedCountries) && !in_array($countryCode, $allowedCountries)) {
                return false;
            }

            if (in_array($countryCode, $blockedCountries)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if a network is allowed.
     */
    public function isNetworkAllowed(User $user, string $network): bool
    {
        $policies = $this->getApplicablePolicies($user, 'network');

        foreach ($policies as $policy) {
            $config = $policy->configuration ?? [];
            $allowedNetworks = $config['allowed_networks'] ?? [];
            $blockedNetworks = $config['blocked_networks'] ?? [];

            if (!empty($allowedNetworks) && !in_array($network, $allowedNetworks)) {
                return false;
            }

            if (in_array($network, $blockedNetworks)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check if a device is allowed.
     */
    public function isDeviceAllowed(User $user, string $deviceId): bool
    {
        $policies = $this->getApplicablePolicies($user, 'device');

        foreach ($policies as $policy) {
            $config = $policy->configuration ?? [];
            $allowedDevices = $config['allowed_devices'] ?? [];
            $blockedDevices = $config['blocked_devices'] ?? [];

            if (!empty($allowedDevices) && !in_array($deviceId, $allowedDevices)) {
                return false;
            }

            if (in_array($deviceId, $blockedDevices)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get brute force protection config.
     */
    public function getBruteForceConfig(User $user): array
    {
        $policies = $this->getApplicablePolicies($user, 'brute_force');

        $config = [
            'max_attempts' => 5,
            'lockout_duration_minutes' => 30,
            'progressive_delay' => true,
            'captcha_after_attempts' => 3,
        ];

        foreach ($policies as $policy) {
            $config = array_merge($config, $policy->configuration ?? []);
        }

        return $config;
    }

    /**
     * Get credential stuffing protection config.
     */
    public function getCredentialStuffingConfig(User $user): array
    {
        $policies = $this->getApplicablePolicies($user, 'credential_stuffing');

        $config = [
            'rate_limit_per_minute' => 10,
            'anomaly_detection' => true,
            'require_mfa_on_suspicious' => true,
        ];

        foreach ($policies as $policy) {
            $config = array_merge($config, $policy->configuration ?? []);
        }

        return $config;
    }

    /**
     * Get risk-based login config.
     */
    public function getRiskConfig(User $user): array
    {
        $policies = $this->getApplicablePolicies($user, 'risk');

        $config = [
            'impossible_travel_detection' => true,
            'new_device_alert' => true,
            'new_location_alert' => true,
            'step_up_mfa_on_risk' => true,
        ];

        foreach ($policies as $policy) {
            $config = array_merge($config, $policy->configuration ?? []);
        }

        return $config;
    }

    /**
     * Get all applicable policies for a user and type.
     */
    private function getApplicablePolicies(User $user, string $type): \Illuminate\Database\Eloquent\Collection
    {
        $cacheKey = "security_policies:{$user->id}:{$type}";

        return Cache::remember($cacheKey, self::CACHE_TTL, function () use ($user, $type) {
            return SecurityPolicy::active()
                ->byType($type)
                ->where(function ($q) use ($user) {
                    // Global policies
                    $q->where('scope', 'global');
                    // Tenant policies
                    if ($user->company_id) {
                        $q->orWhere(function ($q2) use ($user) {
                            $q2->where('scope', 'tenant')
                                ->where('scope_id', $user->company_id);
                        });
                    }
                    // Company policies
                    if ($user->company_id) {
                        $q->orWhere(function ($q2) use ($user) {
                            $q2->where('scope', 'company')
                                ->where('scope_id', $user->company_id);
                        });
                    }
                    // Role policies
                    if ($user->role) {
                        $q->orWhere(function ($q2) use ($user) {
                            $q2->where('scope', 'role')
                                ->where('scope_id', $user->role);
                        });
                    }
                    // User policies
                    $q->orWhere(function ($q2) use ($user) {
                        $q2->where('scope', 'user')
                            ->where('scope_id', $user->id);
                    });
                })
                ->orderBy('priority', 'desc')
                ->get();
        });
    }

    /**
     * Clear policy cache for a user.
     */
    public function clearCache(User $user): void
    {
        $types = ['password', 'ip', 'geo', 'network', 'device', 'country', 'risk', 'brute_force', 'credential_stuffing'];

        foreach ($types as $type) {
            Cache::forget("security_policies:{$user->id}:{$type}");
        }
    }

    /**
     * Create a default password policy.
     */
    public function createDefaultPasswordPolicy(): SecurityPolicy
    {
        return SecurityPolicy::create([
            'name' => 'Default Password Policy',
            'code' => 'default_password_policy',
            'description' => 'Default password policy for all users',
            'type' => 'password',
            'configuration' => [
                'min_length' => 8,
                'require_uppercase' => true,
                'require_lowercase' => true,
                'require_numbers' => true,
                'require_symbols' => true,
                'max_age_days' => 90,
                'history_count' => 5,
                'max_failed_attempts' => 5,
                'lockout_duration_minutes' => 30,
            ],
            'scope' => 'global',
            'is_active' => true,
            'priority' => 0,
        ]);
    }
}