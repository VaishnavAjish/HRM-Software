<?php

namespace App\Services\Authorization;

use Illuminate\Support\Facades\Cache;

/**
 * Version-stamped cache namespacing for authorization data.
 *
 * Nothing is deleted on invalidation. A version counter is bumped, and every key
 * carries the version it was written under, so the old entries simply stop being
 * addressed and expire on their own. That is the right shape for this: the
 * snapshots are per-user and there is no way to enumerate them cheaply.
 *
 * It only works if the counter actually moves, and for a long time it did not.
 *
 *   version() read the counter with a DEFAULT of 1. A default is not a stored
 *   value, so the key was never created. invalidate() then called
 *   Cache::increment(), which on the database and file stores is an UPDATE
 *   against an existing row — with nothing to update it returned false and
 *   created nothing. The version stayed 1 forever, every entry kept its
 *   original namespace, and every invalidate() call in the application was
 *   inert. A permission granted in the matrix did not reach the user until the
 *   300-second TTL expired on its own, which made it look intermittent.
 *
 * Two rules follow, and both are load-bearing:
 *
 *   The counter is written, not defaulted, so increment() always has a row.
 *   The bump falls back to a read-modify-write when increment() cannot create
 *   one, so the guarantee does not depend on which store is configured.
 *
 *   The counters compose. A tenant's effective version is the global counter
 *   plus its own, because role permissions are NOT tenant data — a role edit
 *   invalidates the null tenant, and that has to reach snapshots cached under a
 *   company code. Bumping only "global" while snapshots lived under
 *   "nidhi-impex" is the second half of the same bug.
 */
class AuthorizationCache
{
    /**
     * The effective version for a tenant.
     *
     * Composite on purpose: a global invalidation moves every tenant, so a
     * change to data that is not tenant-scoped — a role's permissions, the
     * permission catalogue, a feature flag — cannot leave a per-tenant snapshot
     * addressing its old namespace.
     */
    public function version(?string $tenantId): int
    {
        $global = $this->counter($this->versionKey(null));

        if ($tenantId === null || $tenantId === '') {
            return $global;
        }

        return $global + $this->counter($this->versionKey($tenantId));
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
        $this->bump($this->versionKey($tenantId));

        // A tenant-scoped change also moves the global counter, so a reader that
        // has no tenant of its own still sees fresh data. Broader than strictly
        // necessary, and deliberately so: over-invalidating costs a rebuild,
        // under-invalidating serves a stale authorization decision.
        if ($tenantId !== null && $tenantId !== '') {
            $this->bump($this->versionKey(null));
        }
    }

    /**
     * The stored counter, materialising it on first read.
     *
     * Writing it here is what makes increment() viable at all — the previous
     * version returned a default and left the key absent, so the counter could
     * never be incremented by any store that requires an existing row.
     */
    private function counter(string $key): int
    {
        $value = Cache::get($key);

        if ($value === null) {
            Cache::forever($key, 1);

            return 1;
        }

        return (int) $value;
    }

    /**
     * Move a counter, whatever the store can do.
     *
     * increment() is preferred because it is atomic where the store supports it.
     * When it cannot — no row, or a store that does not implement it — the
     * read-modify-write fallback still moves the version. A lost update under
     * concurrency would only mean two invalidations collapsing into one bump,
     * which still busts the namespace.
     *
     * forever(), never a TTL: an expiring version key would reset the counter
     * and start re-addressing namespaces that still hold stale entries.
     */
    private function bump(string $key): void
    {
        $current = $this->counter($key);

        if (Cache::increment($key) === false) {
            Cache::forever($key, $current + 1);
        }
    }

    private function versionKey(?string $tenantId): string
    {
        return 'authz:version:' . ($tenantId ?: 'global');
    }
}
