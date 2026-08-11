<?php

use App\Services\Authorization\Matrix\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Catalogue the ui.portals.* capabilities.
 *
 * The registry gained four nodes and the Permission Matrix resolves changes
 * against `permissions.code`, so without this the matrix would display them,
 * accept an edit, and then fail the whole save with CATALOG_OUT_OF_SYNC — a 409
 * that rejects every other change in the same request. That is exactly what the
 * Company & Unit nodes did before the sync became part of the migration.
 *
 * Nothing is granted here. The capabilities exist so an administrator can assign
 * a shell deliberately; until one is granted, portal resolution falls back to
 * the previous rule and no account moves.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasColumn('permissions', 'code')) {
            return;
        }

        app(PermissionCatalogSync::class)->sync();
    }

    /** Not reversed: dropping catalogue rows cascades away real grants. */
    public function down(): void
    {
    }
};
