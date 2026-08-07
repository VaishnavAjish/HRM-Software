<?php

namespace App\Services\Authorization\Matrix;

use App\Support\PermissionOwnership;
use App\Support\PermissionRegistry;
use App\Support\SystemRoles;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

/**
 * Static checks over the canonical registry, the catalogue and the route table.
 *
 * The point is to make authorization gaps visible instead of silent. A page that
 * ships without a permission is not a missing feature an administrator can spot
 * on the matrix — it is an unauthorized surface that looks exactly like a page
 * nobody has granted yet. These checks separate the two.
 */
class PermissionValidator
{
    public const SEVERITY_ERROR = 'ERROR';
    public const SEVERITY_WARNING = 'WARNING';

    /** @return list<array{code:string,severity:string,subject:string,message:string}> */
    public function all(): array
    {
        return array_merge(
            $this->duplicateOrInvalidParents(),
            $this->cycles(),
            $this->catalogDrift(),
            $this->missingImpliedCodes(),
            $this->sensitivityGaps(),
            $this->unsafePermissionOwnership(),
            $this->orphanCanonicalPermissions(),
            $this->unmappedProtectedRoutes(),
            $this->protectedRoleExposure(),
        );
    }

    public function errors(): array
    {
        return array_values(array_filter($this->all(), fn ($issue) => $issue['severity'] === self::SEVERITY_ERROR));
    }

    /** INVALID PARENT — a node points at a parent the registry does not define. */
    private function duplicateOrInvalidParents(): array
    {
        $issues = [];

        foreach (PermissionRegistry::all() as $key => $node) {
            $parent = $node['parent'];

            if ($parent !== null && ! PermissionRegistry::has($parent)) {
                $issues[] = $this->issue('INVALID_PARENT', self::SEVERITY_ERROR, $key, "Parent \"{$parent}\" is not registered.");
            }
        }

        return $issues;
    }

    /** CYCLIC PERMISSION TREE — A → B → C → A. */
    private function cycles(): array
    {
        $issues = [];

        foreach (array_keys(PermissionRegistry::all()) as $key) {
            $seen = [];
            $current = $key;
            $depth = 0;

            while ($current !== null && $depth++ < 64) {
                if (isset($seen[$current])) {
                    $issues[] = $this->issue('CYCLIC_TREE', self::SEVERITY_ERROR, $key, 'Parent chain contains a cycle.');
                    break;
                }

                $seen[$current] = true;
                $current = PermissionRegistry::node($current)['parent'] ?? null;
            }
        }

        return $issues;
    }

    /** The catalogue is missing a canonical code, so its cells cannot be saved. */
    private function catalogDrift(): array
    {
        $known = DB::table('permissions')->pluck('code')->map('strval')->flip();
        $issues = [];

        foreach (PermissionRegistry::permissionCodes() as $code) {
            if (! $known->has($code)) {
                $issues[] = $this->issue(
                    'CATALOG_OUT_OF_SYNC', self::SEVERITY_ERROR, $code,
                    'Canonical code is not in the permissions catalogue. Run authz:sync-catalog.'
                );
            }
        }

        return $issues;
    }

    /** LEGACY MAPPING ERROR — an implied business code does not exist. */
    private function missingImpliedCodes(): array
    {
        $known = DB::table('permissions')->pluck('code')->map('strval')->flip();
        $issues = [];

        foreach (PermissionRegistry::all() as $key => $node) {
            foreach ($node['implies'] as $code) {
                if (! $known->has($code)) {
                    $issues[] = $this->issue(
                        'LEGACY_MAPPING_ERROR', self::SEVERITY_ERROR, $key,
                        "Implied business permission \"{$code}\" does not exist."
                    );
                }
            }
        }

        return $issues;
    }

    /** SENSITIVITY ERROR — a destructive action left at NORMAL sensitivity. */
    private function sensitivityGaps(): array
    {
        $destructive = ['delete', 'reset_password', 'assign_role', 'assign_permission', 'reveal', 'override', 'rollback'];
        $issues = [];

        foreach (PermissionRegistry::all() as $key => $node) {
            if ($node['sensitivity'] !== PermissionRegistry::SENSITIVITY_NORMAL) {
                continue;
            }

            foreach ($destructive as $marker) {
                if (str_contains($key, $marker)) {
                    $issues[] = $this->issue(
                        'SENSITIVITY_MISSING', self::SEVERITY_WARNING, $key,
                        'Destructive capability is registered with NORMAL sensitivity.'
                    );

                    break;
                }
            }
        }

        return $issues;
    }

    /** ORPHAN PERMISSION — a canonical code in the catalogue with no registry node. */
    private function orphanCanonicalPermissions(): array
    {
        $issues = [];

        $orphans = DB::table('permissions')
            ->where('code', 'like', 'ui.%')
            ->where('is_active', true)
            ->pluck('code')
            ->reject(fn ($code) => PermissionRegistry::has((string) $code))
            ->reject(fn ($code) => in_array((string) $code, PermissionRegistry::impliedPermissionCodes(), true));

        foreach ($orphans as $code) {
            $issues[] = $this->issue(
                'ORPHAN_PERMISSION', self::SEVERITY_WARNING, (string) $code,
                'Active canonical permission has no registry node and no application consumer.'
            );
        }

        return $issues;
    }

    /**
     * MISSING API PERMISSION — a protected API route with no `permission:` gate.
     *
     * Only routes already inside the authenticated group are considered; public
     * endpoints are intentionally ungated and would otherwise dominate the report.
     */
    private function unmappedProtectedRoutes(): array
    {
        $issues = [];

        foreach (Route::getRoutes() as $route) {
            $middleware = $route->gatherMiddleware();

            if (! in_array('jwt.auth', $middleware, true)) {
                continue;
            }

            $hasPermission = false;

            foreach ($middleware as $entry) {
                if (is_string($entry) && str_starts_with($entry, 'permission:')) {
                    $hasPermission = true;
                    break;
                }
            }

            if ($hasPermission) {
                continue;
            }

            $issues[] = $this->issue(
                'MISSING_API_PERMISSION', self::SEVERITY_WARNING, $route->uri(),
                'Authenticated route has no permission middleware.'
            );
        }

        return $issues;
    }

    /** PROTECTED ROLE EXPOSURE — the hidden identity is reachable from ordinary role APIs. */
    private function protectedRoleExposure(): array
    {
        if (SystemRoles::revealed()) {
            return [$this->issue(
                'PROTECTED_ROLE_EXPOSURE', self::SEVERITY_ERROR, 'security.show_system_role',
                'The protected system role is configured to be visible in ordinary role listings.'
            )];
        }

        $leaked = SystemRoles::exclude(DB::table('roles'))
            ->whereIn('code', SystemRoles::protectedCodes())
            ->count();

        return $leaked === 0 ? [] : [$this->issue(
            'PROTECTED_ROLE_EXPOSURE', self::SEVERITY_ERROR, 'roles',
            'The protected role exclusion is not filtering the hidden identity.'
        )];
    }

    /**
     * UNSAFE_PERMISSION_OWNERSHIP — core would write a code it does not own.
     *
     * Structural, not migration debt: if this fires, the synchroniser is aimed at
     * another system's permission, which is precisely the failure that
     * deactivated the portal dashboards. The build should stop.
     */
    private function unsafePermissionOwnership(): array
    {
        $issues = [];

        foreach (PermissionRegistry::permissionCodes() as $code) {
            if (PermissionOwnership::canCoreSync($code)) {
                continue;
            }

            $issues[] = $this->issue(
                'UNSAFE_PERMISSION_OWNERSHIP', self::SEVERITY_ERROR, $code,
                sprintf(
                    'Canonical registry code resolves to owner %s, so core sync would write a permission it does not own.',
                    PermissionOwnership::ownerOf($code),
                ),
            );
        }

        // A prefix mapped to two different owners makes resolution order matter,
        // which is exactly the non-determinism this class exists to remove.
        $seen = [];

        foreach (PermissionOwnership::externalPrefixes() as $prefix => $owner) {
            if (isset($seen[$prefix]) && $seen[$prefix] !== $owner) {
                $issues[] = $this->issue(
                    'DUPLICATE_PERMISSION_OWNER', self::SEVERITY_ERROR, $prefix,
                    'External prefix is mapped to more than one owner.',
                );
            }

            $seen[$prefix] = $owner;
        }

        return $issues;
    }

    private function issue(string $code, string $severity, string $subject, string $message): array
    {
        return compact('code', 'severity', 'subject', 'message');
    }
}
