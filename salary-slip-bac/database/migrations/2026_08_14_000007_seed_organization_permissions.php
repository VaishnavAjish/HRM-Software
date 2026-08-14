<?php

use Database\Seeders\OrganizationPermissionSeeder;
use Illuminate\Database\Migrations\Migration;

/**
 * Seeds the Organization workspace permission codes (DOMAIN 02).
 *
 * Same idempotent pattern as 2026_08_11_000005_seed_company_unit_permissions:
 * the seeder upserts the permissions table rows and role_permissions grants, so
 * re-running migration is safe. The codes are ALSO projected by
 * authz:sync-catalog from PermissionRegistry::NODES; the seeder grants them to
 * the built-in roles because sync only materialises the records, it does not
 * decide who holds them.
 */
return new class extends Migration
{
    public function up(): void
    {
        (new OrganizationPermissionSeeder())->run();
    }

    public function down(): void
    {
        // The seeder is idempotent and grants are additive; removing the codes
        // here would race the catalog sync that owns the permissions table.
    }
};
