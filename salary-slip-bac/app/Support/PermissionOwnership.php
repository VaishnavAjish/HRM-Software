<?php

namespace App\Support;

/**
 * Which application surface owns a permission code.
 *
 * This exists because a synchroniser once decided ownership from the `ui.`
 * prefix, concluded that `ui.agent.dashboard.view` and
 * `ui.employee.dashboard.view` were core codes that had been removed, and
 * deactivated them — denying the agent and employee portals to everyone holding
 * them. A prefix is a naming convention. It is not proof of ownership.
 *
 * Ownership is therefore resolved in this order:
 *
 *   1. membership of the canonical PermissionRegistry  → HRMS_CORE
 *   2. the longest matching external prefix            → that owner
 *   3. no rule matches                                 → UNKNOWN
 *
 * Registry membership is checked first and deliberately: `ui.` maps to LEGACY as
 * a catch-all, so without that precedence every canonical code would be
 * misclassified by its own namespace. Only HRMS_CORE is writable by core sync;
 * UNKNOWN is preserved, never cleaned up, because "core does not recognise it"
 * and "nobody owns it" are different statements and only the second would
 * justify touching it.
 */
class PermissionOwnership
{
    public const HRMS_CORE = 'HRMS_CORE';
    public const AGENT_PORTAL = 'AGENT_PORTAL';
    public const EMPLOYEE_PORTAL = 'EMPLOYEE_PORTAL';
    public const LEGACY = 'LEGACY';
    public const UNKNOWN = 'UNKNOWN';

    public const OWNERS = [self::HRMS_CORE, self::AGENT_PORTAL, self::EMPLOYEE_PORTAL, self::LEGACY, self::UNKNOWN];

    /**
     * Explicit external namespace → owner.
     *
     * Derived from the codes actually present in the catalogue, not invented.
     * `ui.` is claimed by LEGACY for the pre-registry `ui.admin.*` view codes;
     * the two portal namespaces sit beneath it and win by being longer, which is
     * exactly the case the longest-prefix rule exists to get right.
     */
    private const EXTERNAL_PREFIXES = [
        'ui.' => self::LEGACY,
        'ui.agent.' => self::AGENT_PORTAL,
        'ui.employee.' => self::EMPLOYEE_PORTAL,
        'self.' => self::EMPLOYEE_PORTAL,
        'admin.' => self::LEGACY,
        'hr.' => self::LEGACY,
        'payroll.' => self::LEGACY,
        'recruitment.' => self::LEGACY,
        'document.' => self::LEGACY,
        'dashboard.' => self::LEGACY,
        'workflow.' => self::LEGACY,
        'support.' => self::LEGACY,
    ];

    public static function ownerOf(string $code): string
    {
        // Explicit canonical membership outranks every naming rule.
        if (PermissionRegistry::has($code) && PermissionRegistry::node($code)['permission'] !== null) {
            return self::HRMS_CORE;
        }

        $bestPrefix = null;
        $bestOwner = self::UNKNOWN;

        foreach (self::EXTERNAL_PREFIXES as $prefix => $owner) {
            if (! str_starts_with($code, $prefix)) {
                continue;
            }

            // Longest wins, so a broad namespace never shadows a specific one.
            if ($bestPrefix === null || strlen($prefix) > strlen($bestPrefix)) {
                $bestPrefix = $prefix;
                $bestOwner = $owner;
            }
        }

        return $bestOwner;
    }

    public static function isCoreOwned(string $code): bool
    {
        return self::ownerOf($code) === self::HRMS_CORE;
    }

    /**
     * May the core synchroniser write this code?
     *
     * The single gate every write must pass. Anything but HRMS_CORE is preserved:
     * when ownership is uncertain the safe error is leaving another system's
     * permission alone, not editing it so a sync can finish.
     */
    public static function canCoreSync(string $code): bool
    {
        return self::isCoreOwned($code);
    }

    /** @return array<string,string> code => owner */
    public static function classify(iterable $codes): array
    {
        $out = [];

        foreach ($codes as $code) {
            $out[(string) $code] = self::ownerOf((string) $code);
        }

        return $out;
    }

    /** @return array<string,int> owner => count */
    public static function counts(iterable $codes): array
    {
        $counts = array_fill_keys(self::OWNERS, 0);

        foreach (self::classify($codes) as $owner) {
            $counts[$owner]++;
        }

        return $counts;
    }

    /** The configured external namespaces, longest first. */
    public static function externalPrefixes(): array
    {
        $prefixes = self::EXTERNAL_PREFIXES;

        uksort($prefixes, fn ($a, $b) => strlen($b) <=> strlen($a));

        return $prefixes;
    }
}
