<?php

namespace Tests\Feature;

use App\Support\PermissionRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Every registry node must have a row in the permissions catalogue.
 *
 * The Permission Matrix renders the registry, but RoleMatrixWriter resolves each
 * change against `permissions.code`. A node the registry declares and the
 * catalogue lacks is therefore shown to an administrator, is editable, and then
 * fails the save with CATALOG_OUT_OF_SYNC — which the API returns as a 409
 * Conflict. The write is one transaction, so the entire save fails, not just the
 * offending row.
 *
 * That is not hypothetical. Adding the Company & Unit nodes put eleven codes in
 * the registry and none in the catalogue, and every matrix save that touched
 * them answered 409 until `authz:sync-catalog` was run.
 *
 * The catalogue is now synchronised by migration, so it travels with the
 * registry change instead of depending on somebody remembering a command. This
 * test is the guard on that: adding a registry node without the sync fails here,
 * rather than in an administrator's browser.
 */
class RegistryCatalogueParityTest extends TestCase
{
    use RefreshDatabase;

    /**
     * The assignable nodes, which are the ones the matrix can actually write.
     *
     * Not every registry node is grantable: sections like
     * `ui.employees.master.filters` carry `assignable => false`, so the registry
     * gives them no permission and the catalogue sync skips them on purpose.
     * They group the tree; they are not something a role can hold.
     *
     * @return list<string>
     */
    private function assignableCodes(): array
    {
        return array_values(array_keys(array_filter(
            PermissionRegistry::all(),
            static fn (array $node) => ($node['permission'] ?? null) !== null,
        )));
    }

    public function test_every_assignable_registry_node_has_a_catalogue_row(): void
    {
        $declared = $this->assignableCodes();
        $catalogued = DB::table('permissions')->whereIn('code', $declared)->pluck('code')->all();

        $missing = array_values(array_diff($declared, $catalogued));

        $this->assertSame(
            [],
            $missing,
            "These registry nodes have no permissions row, so any matrix save touching them\n"
            . "returns 409 CATALOG_OUT_OF_SYNC and the whole save is rejected:\n  "
            . implode("\n  ", $missing)
            . "\n\nThe catalogue sync runs as a migration; if this fails, the registry gained a\n"
            . "node without it — run `php artisan authz:sync-catalog` and check the migration."
        );
    }

    public function test_the_matrix_can_resolve_every_node_it_renders(): void
    {
        // The same invariant stated the way the writer actually checks it: it
        // looks up `code`, not `name`, and the two columns are not guaranteed
        // to agree for legacy rows.
        $declared = $this->assignableCodes();

        $resolvable = DB::table('permissions')
            ->whereIn('code', $declared)
            ->whereNotNull('code')
            ->count();

        $this->assertSame(count($declared), $resolvable);
    }

    public function test_the_company_and_unit_nodes_are_catalogued(): void
    {
        // The specific eleven whose absence produced the reported 409.
        $codes = array_values(array_filter(
            $this->assignableCodes(),
            static fn (string $code) => str_starts_with($code, 'ui.access_control.company_units'),
        ));

        $this->assertNotEmpty($codes);
        $this->assertSame(
            count($codes),
            DB::table('permissions')->whereIn('code', $codes)->count(),
        );
    }
}
