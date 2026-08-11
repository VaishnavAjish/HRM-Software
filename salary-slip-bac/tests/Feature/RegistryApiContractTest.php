<?php

namespace Tests\Feature;

use App\Support\PermissionRegistry;
use Illuminate\Support\Facades\Route;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Every API mapping the registry declares must describe a real route.
 *
 * The API Permissions tab is built from this metadata, so a mapping nobody
 * checks is worse than no mapping: all nine entries once pointed at endpoints
 * that did not exist, and the screen reported them as "Protected" against
 * effective results it had computed. An administrator reading it saw coverage
 * for DELETE /api/employees/{id} while the endpoint that actually deletes an
 * employee appeared nowhere.
 *
 * Route identity is method plus URI. GET and POST on one path are different
 * mappings, and matching on the path alone silently accepts a verb that was
 * never wired.
 */
class RegistryApiContractTest extends TestCase
{
    /** @return list<array{0:string,1:string,2:string}> code, verb, path */
    private function declaredMappings(): array
    {
        $out = [];

        foreach (PermissionRegistry::all() as $code => $node) {
            foreach ($node['api'] ?? [] as [$verb, $path]) {
                $out[] = [$code, strtoupper($verb), $path];
            }
        }

        return $out;
    }

    private function findRoute(string $verb, string $path): ?\Illuminate\Routing\Route
    {
        foreach (Route::getRoutes() as $route) {
            if ('/'.ltrim($route->uri(), '/') !== $path) {
                continue;
            }

            if (in_array($verb, $route->methods(), true)) {
                return $route;
            }
        }

        return null;
    }

    private function enforcedPermission(\Illuminate\Routing\Route $route): ?string
    {
        foreach ($route->gatherMiddleware() as $middleware) {
            if (! is_string($middleware)) {
                continue;
            }

            if (str_contains($middleware, 'RequirePermission:') || str_starts_with($middleware, 'permission:')) {
                return substr($middleware, strpos($middleware, ':') + 1);
            }
        }

        return null;
    }

    #[Test]
    public function the_registry_declares_at_least_one_api_mapping(): void
    {
        $this->assertNotEmpty(
            $this->declaredMappings(),
            'No API mappings declared — the API Permissions tab would have nothing to verify.',
        );
    }

    #[Test]
    public function every_declared_api_mapping_resolves_to_a_real_route(): void
    {
        $missing = [];

        foreach ($this->declaredMappings() as [$code, $verb, $path]) {
            if ($this->findRoute($verb, $path) === null) {
                $missing[] = "{$code} -> {$verb} {$path}";
            }
        }

        $this->assertSame([], $missing, "Registry declares routes that do not exist:\n".implode("\n", $missing));
    }

    #[Test]
    public function every_declared_api_mapping_is_actually_protected(): void
    {
        $unprotected = [];

        foreach ($this->declaredMappings() as [$code, $verb, $path]) {
            $route = $this->findRoute($verb, $path);

            if ($route === null) {
                continue;
            }

            if ($this->enforcedPermission($route) === null) {
                $unprotected[] = "{$code} -> {$verb} {$path}";
            }
        }

        $this->assertSame(
            [],
            $unprotected,
            "Registry reports these as protected but no permission middleware is present:\n".implode("\n", $unprotected),
        );
    }

    /**
     * The code the route enforces has to be one the node projects, or granting
     * the node in the matrix authorises nothing. ui.dashboard claimed
     * /api/admin-dashboard while implying only a page-visibility code, so the
     * grant and the endpoint never met.
     */
    #[Test]
    public function every_declared_api_mapping_enforces_a_code_the_node_implies(): void
    {
        $mismatched = [];

        foreach ($this->declaredMappings() as [$code, $verb, $path]) {
            $route = $this->findRoute($verb, $path);

            if ($route === null) {
                continue;
            }

            $enforced = $this->enforcedPermission($route);

            if ($enforced === null) {
                continue;
            }

            $implied = PermissionRegistry::impliedCodes($code);

            if (! in_array($enforced, $implied, true)) {
                $mismatched[] = "{$code} -> {$verb} {$path} enforces {$enforced}, implies ".implode('/', $implied);
            }
        }

        $this->assertSame([], $mismatched, "Route enforcement does not match the node's implied codes:\n".implode("\n", $mismatched));
    }
}
