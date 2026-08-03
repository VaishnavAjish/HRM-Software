<?php

namespace App\Services\Authorization;

use App\Models\AuthorizationFeatureFlag;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Schema;

class FeatureFlags
{
    public function enabled(string $key, ?string $tenantId = null, bool $default = false): bool
    {
        if (!Schema::hasTable('authorization_feature_flags')) {
            return $default;
        }

        $cacheKey = 'authz:flag:' . ($tenantId ?: 'global') . ':' . $key;
        return (bool) Cache::remember($cacheKey, 60, function () use ($key, $tenantId, $default) {
            $flag = AuthorizationFeatureFlag::query()
                ->where('key', $key)
                ->whereIn('tenant_id', array_values(array_unique(array_filter([$tenantId, '*']))))
                ->orderByRaw('CASE WHEN tenant_id = ? THEN 0 ELSE 1 END', [$tenantId ?: '*'])
                ->first();
            return $flag?->enabled ?? $default;
        });
    }

    public function forget(string $key, ?string $tenantId = null): void
    {
        Cache::forget('authz:flag:' . ($tenantId ?: 'global') . ':' . $key);
    }
}
