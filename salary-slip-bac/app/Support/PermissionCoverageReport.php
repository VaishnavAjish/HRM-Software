<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Validation for the canonical registry (see the enterprise authorization spec,
 * "Validation Engine").
 *
 * Answers the question the Permission Matrix cannot answer about itself: which
 * parts of the running application have no authorization definition at all. A
 * navigation entry with no permission is not a gap in a screen, it is a page
 * nobody can gate.
 */
class PermissionCoverageReport
{
    private const NAV_SOURCE = 'salary-slip-front/salary-slip-front/src/components/layout/useNavItems.js';

    private const ROUTE_SOURCE = 'routes/api.php';

    public static function build(?string $navFile = null, ?string $routeFile = null): array
    {
        $navRoutes = self::navRoutes($navFile);
        $registryRoutes = self::registryRoutes();
        $registryCodes = PermissionRegistry::permissionCodes();

        $knownCodes = self::catalogueCodes();
        $enforcedCodes = self::enforcedRouteCodes($routeFile);

        return [
            'navRoutes' => $navRoutes,
            'registryRoutes' => $registryRoutes,
            'unmappedNavRoutes' => array_values(array_diff($navRoutes, $registryRoutes)),
            'orphanRegistryRoutes' => array_values(array_diff($registryRoutes, $navRoutes)),
            'missingPermissions' => array_values(array_diff($registryCodes, $knownCodes)),
            'unenforcedRegistryCodes' => array_values(array_diff($registryCodes, $enforcedCodes)),
            'duplicateNodeCodes' => self::duplicateNodeCodes(),
            'invalidParents' => self::invalidParents(),
            'cycles' => self::cycles(),
        ];
    }

    public static function isClean(array $report): bool
    {
        foreach (['missingPermissions', 'duplicateNodeCodes', 'invalidParents', 'cycles'] as $fatal) {
            if ($report[$fatal] !== []) {
                return false;
            }
        }

        return true;
    }

    /** @return list<string> */
    public static function navRoutes(?string $navFile = null): array
    {
        $path = $navFile ?? base_path('../' . self::NAV_SOURCE);

        if (! is_file($path)) {
            return [];
        }

        preg_match_all('#"(/(?:admin|employee|agent)[a-z0-9/_-]*)"#i', (string) file_get_contents($path), $m);

        $routes = array_values(array_unique($m[1] ?? []));
        sort($routes);

        return $routes;
    }

    /** @return list<string> */
    public static function registryRoutes(): array
    {
        $routes = [];

        foreach (PermissionRegistry::all() as $node) {
            if (($route = $node['route'] ?? null) !== null) {
                $routes[$route] = true;
            }
        }

        $out = array_keys($routes);
        sort($out);

        return $out;
    }

    /** Permission codes enforced by route middleware. */
    public static function enforcedRouteCodes(?string $routeFile = null): array
    {
        $path = $routeFile ?? base_path(self::ROUTE_SOURCE);

        if (! is_file($path)) {
            return [];
        }

        preg_match_all('/permission:([a-z0-9_.]+)/i', (string) file_get_contents($path), $m);

        return array_values(array_unique($m[1] ?? []));
    }

    private static function catalogueCodes(): array
    {
        try {
            return DB::table('permissions')->pluck('code')->map('strval')->all();
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * A registry key claimed twice.
     *
     * Keys, not business codes. This read `$node['permission']`, a field the
     * registry no longer has — it now declares `implies`, a list — so the check
     * silently compared nulls and reported no duplicates whatever the data. A
     * business code being implied by several nodes is legitimate and common
     * (a page and its list feature both imply the same read), so flagging that
     * would be noise; a duplicated key is the genuine fault.
     */
    private static function duplicateNodeCodes(): array
    {
        $seen = [];
        $dupes = [];

        foreach (array_keys(PermissionRegistry::all()) as $key) {
            if (isset($seen[$key])) {
                $dupes[] = $key;
            }
            $seen[$key] = true;
        }

        return $dupes;
    }

    private static function invalidParents(): array
    {
        $invalid = [];

        foreach (PermissionRegistry::all() as $key => $node) {
            $parent = $node['parent'] ?? null;
            if ($parent !== null && ! PermissionRegistry::has($parent)) {
                $invalid[] = $key . ' -> ' . $parent;
            }
        }

        return $invalid;
    }

    private static function cycles(): array
    {
        $cycles = [];

        foreach (array_keys(PermissionRegistry::all()) as $key) {
            $seen = [];
            $current = $key;

            while ($current !== null) {
                if (isset($seen[$current])) {
                    $cycles[] = $key;
                    break;
                }
                $seen[$current] = true;
                $current = PermissionRegistry::node($current)['parent'] ?? null;
            }
        }

        return $cycles;
    }
}
