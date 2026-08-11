<?php

namespace Tests\Feature;

use App\Support\PermissionCoverageReport;
use App\Support\PermissionRegistry;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionCoverageReportTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_registry_never_references_a_permission_that_does_not_exist(): void
    {
        $this->seed(RbacSeeder::class);
        // The canonical ui.* codes are created by the catalogue sync,
        // not the RBAC seeder — without it the registry legitimately
        // references codes the fresh test database has not got yet.
        app(\App\Services\Authorization\Matrix\PermissionCatalogSync::class)->sync();

        $this->assertSame([], PermissionCoverageReport::build()['missingPermissions']);
    }

    public function test_the_registry_has_no_duplicate_permission_codes(): void
    {
        $this->assertSame([], PermissionCoverageReport::build()['duplicateNodeCodes']);
    }

    public function test_the_registry_has_no_dangling_parents(): void
    {
        $this->assertSame([], PermissionCoverageReport::build()['invalidParents']);
    }

    public function test_the_registry_tree_is_acyclic(): void
    {
        $this->assertSame([], PermissionCoverageReport::build()['cycles']);
    }

    public function test_a_clean_registry_reports_clean(): void
    {
        $this->seed(RbacSeeder::class);
        // The canonical ui.* codes are created by the catalogue sync,
        // not the RBAC seeder — without it the registry legitimately
        // references codes the fresh test database has not got yet.
        app(\App\Services\Authorization\Matrix\PermissionCatalogSync::class)->sync();

        $this->assertTrue(PermissionCoverageReport::isClean(PermissionCoverageReport::build()));
    }

    public function test_registry_routes_are_discovered(): void
    {
        $routes = PermissionCoverageReport::registryRoutes();

        $this->assertContains('/admin/attendance', $routes);
        $this->assertContains('/admin/attendance/shift', $routes);
    }

    public function test_navigation_routes_are_discovered_from_the_shared_nav_source(): void
    {
        $routes = PermissionCoverageReport::navRoutes();

        $this->assertNotEmpty($routes, 'The nav source must be readable for coverage to mean anything.');
        $this->assertContains('/admin/attendance', $routes);
    }

    public function test_unmapped_navigation_routes_are_reported_not_hidden(): void
    {
        $report = PermissionCoverageReport::build();

        $this->assertArrayHasKey('unmappedNavRoutes', $report);
        // Named routes drift as the registry grows; what must hold is that a
        // route absent from the registry is reported rather than swallowed.
        $this->assertSame(
            array_values(array_diff($report['navRoutes'], $report['registryRoutes'])),
            $report['unmappedNavRoutes']
        );
    }

    public function test_enforced_route_codes_are_read_from_the_api_routes(): void
    {
        $enforced = PermissionCoverageReport::enforcedRouteCodes();

        $this->assertContains('hr.shift.read', $enforced);
        $this->assertContains('hr.attendance.read', $enforced);
    }

    public function test_a_missing_nav_source_degrades_to_empty_rather_than_throwing(): void
    {
        $this->assertSame([], PermissionCoverageReport::navRoutes(base_path('does/not/exist.js')));
    }

    public function test_every_registry_node_with_a_route_is_a_page_or_module(): void
    {
        foreach (PermissionRegistry::all() as $key => $node) {
            if (($node['route'] ?? null) === null) {
                continue;
            }
            $this->assertContains(
                $node['type'],
                [PermissionRegistry::TYPE_MODULE, PermissionRegistry::TYPE_PAGE],
                "{$key} binds a route but is not a module or page."
            );
        }
    }

    public function test_the_command_runs_and_reports(): void
    {
        $this->seed(RbacSeeder::class);
        // The canonical ui.* codes are created by the catalogue sync,
        // not the RBAC seeder — without it the registry legitimately
        // references codes the fresh test database has not got yet.
        app(\App\Services\Authorization\Matrix\PermissionCatalogSync::class)->sync();

        $this->artisan('authz:coverage')->assertExitCode(0);
    }

    public function test_strict_mode_still_passes_while_the_registry_is_free_of_fatal_errors(): void
    {
        $this->seed(RbacSeeder::class);
        // The canonical ui.* codes are created by the catalogue sync,
        // not the RBAC seeder — without it the registry legitimately
        // references codes the fresh test database has not got yet.
        app(\App\Services\Authorization\Matrix\PermissionCatalogSync::class)->sync();

        $this->artisan('authz:coverage --strict')->assertExitCode(0);
    }
}
