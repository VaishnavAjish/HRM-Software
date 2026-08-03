<?php

namespace App\Services\Authorization;

use Illuminate\Support\Facades\Cache;

class AuthorizationCache
{
    public function version(?string $tenantId): int
    {
        return (int) Cache::get($this->versionKey($tenantId), 1);
    }

    public function remember(string $key, ?string $tenantId, callable $resolver, int $seconds = 300): mixed
    {
        return Cache::remember(
            'authz:v' . $this->version($tenantId) . ':' . ($tenantId ?: 'global') . ':' . $key,
            $seconds,
            $resolver
        );
    }

    public function invalidate(?string $tenantId = null): void
    {
        Cache::increment($this->versionKey($tenantId));
        if ($tenantId !== null) {
            Cache::increment($this->versionKey(null));
        }
    }

    private function versionKey(?string $tenantId): string
    {
        return 'authz:version:' . ($tenantId ?: 'global');
    }
}
