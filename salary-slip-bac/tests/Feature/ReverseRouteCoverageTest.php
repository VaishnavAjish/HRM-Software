<?php

namespace Tests\Feature;

use App\Support\PermissionRegistry;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Every permission-protected route should be reachable from the registry.
 *
 * RegistryApiContractTest proves the mappings that exist point at real routes.
 * That is only half the contract: it says nothing about protected routes the
 * registry has never heard of, and the first version of the API Permissions tab
 * was wrong in exactly that direction — nine declared mappings against 224
 * protected routes, none of which existed.
 *
 * A business code with no canonical owner cannot be granted through the
 * Permission Matrix at all. The route enforces it, the middleware works, but no
 * screen can turn it on: the capability is invisible to administration.
 *
 * The backlog is large and predates this test, so this is a ratchet rather than
 * a clean assertion. The baseline below is the set of orphans known when it was
 * written; a new one fails the build. Deleting an entry as it gains an owner is
 * expected — the list should only ever shrink.
 */
class ReverseRouteCoverageTest extends TestCase
{
    /**
     * Business codes enforced by a route that no registry node implies.
     *
     * Every entry here is a Permission Matrix coverage gap, not a passing case.
     */
    private const KNOWN_ORPHAN_CODES = [
        'admin.authorization.configure',
        'admin.configuration.read',
        'admin.configuration.update',
        'admin.policy.update',
        'admin.user.assign_permission',
        'document.file.restore',
        'document.file.update',
        'hr.asset.update',
        'hr.candidate.delete',
        'hr.candidate.update',
        'hr.department.create',
        'hr.department.delete',
        'hr.department.update',
        'hr.interview.create',
        'hr.interview.delete',
        'hr.interview.update',
        'hr.offer.approve',
        'hr.offer.create',
        'hr.offer.update',
        'hr.onboarding.document.read',
        'hr.onboarding.journey.read',
        'hr.performance.update',
        'hr.requisition.delete',
        'hr.requisition.update',
        'hr.training.create',
        'hr.training.delete',
        'hr.training.read',
        'hr.training.update',
        'recruitment.candidate.read',
        'self.ticket.create',
        'self.ticket.read',
    ];

    /** @return array<string,list<string>> business code => routes enforcing it */
    private function protectedRoutes(): array
    {
        $out = [];

        foreach (Route::getRoutes() as $route) {
            $code = null;

            foreach ($route->gatherMiddleware() as $middleware) {
                if (! is_string($middleware)) {
                    continue;
                }

                if (str_contains($middleware, 'RequirePermission:') || str_starts_with($middleware, 'permission:')) {
                    $code = substr($middleware, strpos($middleware, ':') + 1);
                }
            }

            if ($code === null) {
                continue;
            }

            $verbs = implode('|', array_diff($route->methods(), ['HEAD']));
            $out[$code][] = "{$verbs} /{$route->uri()}";
        }

        return $out;
    }

    /** Business codes any registry node projects onto. */
    private function ownedCodes(): array
    {
        $owned = [];

        foreach (array_keys(PermissionRegistry::all()) as $key) {
            foreach (PermissionRegistry::impliedCodes($key) as $code) {
                $owned[$code] = true;
            }
        }

        return $owned;
    }

    #[Test]
    public function no_new_business_code_lacks_a_canonical_owner(): void
    {
        $owned = $this->ownedCodes();
        $orphans = [];

        foreach ($this->protectedRoutes() as $code => $routes) {
            if (isset($owned[$code])) {
                continue;
            }

            if (in_array($code, self::KNOWN_ORPHAN_CODES, true)) {
                continue;
            }

            $orphans[] = "{$code} enforced by ".implode(', ', $routes);
        }

        $this->assertSame(
            [],
            $orphans,
            "These routes enforce a business code no registry node implies, so the "
            ."Permission Matrix cannot grant them:\n".implode("\n", $orphans),
        );
    }

    /**
     * The baseline is a backlog, not a target. If an entry gains an owner it must
     * be removed from the list, otherwise the ratchet silently stops protecting
     * that code.
     */
    #[Test]
    public function the_orphan_baseline_contains_no_codes_that_now_have_owners(): void
    {
        $owned = $this->ownedCodes();
        $resolved = [];

        foreach (self::KNOWN_ORPHAN_CODES as $code) {
            if (isset($owned[$code])) {
                $resolved[] = $code;
            }
        }

        $this->assertSame(
            [],
            $resolved,
            "These codes now have a canonical owner and must be removed from "
            ."KNOWN_ORPHAN_CODES:\n".implode("\n", $resolved),
        );
    }

    /**
     * A code no route enforces is dead weight in the baseline — it should be
     * dropped rather than left implying a gap that no longer exists.
     */
    #[Test]
    public function the_orphan_baseline_contains_no_codes_without_routes(): void
    {
        $enforced = $this->protectedRoutes();
        $unused = [];

        foreach (self::KNOWN_ORPHAN_CODES as $code) {
            if (! isset($enforced[$code])) {
                $unused[] = $code;
            }
        }

        $this->assertSame(
            [],
            $unused,
            "These baseline codes are no longer enforced by any route and should be "
            ."removed from KNOWN_ORPHAN_CODES:\n".implode("\n", $unused),
        );
    }
}
