<?php

namespace App\Services\Authorization;

class PermissionEnforcementPolicy
{
    public const SHADOW = 'SHADOW';

    public const ENFORCED = 'ENFORCED';

    public function modeFor(string $permissionKey, ?string $routeName = null, ?string $tenantId = null): string
    {
        $config = config('authorization.enforcement', []);

        foreach ($config['always_enforced_prefixes'] ?? [] as $prefix) {
            if (str_starts_with($permissionKey, $prefix)) {
                return self::ENFORCED;
            }
        }

        if (in_array($permissionKey, $config['enforced_permissions'] ?? [], true)) {
            return self::ENFORCED;
        }

        foreach ($config['enforced_prefixes'] ?? [] as $prefix) {
            if ($prefix !== '' && str_starts_with($permissionKey, $prefix)) {
                return self::ENFORCED;
            }
        }

        return ($config['default_mode'] ?? 'shadow') === 'enforced'
            ? self::ENFORCED
            : self::SHADOW;
    }

    public function isEnforced(string $permissionKey, ?string $routeName = null, ?string $tenantId = null): bool
    {
        return $this->modeFor($permissionKey, $routeName, $tenantId) === self::ENFORCED;
    }
}
