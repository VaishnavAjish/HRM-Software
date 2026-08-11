<?php

use App\Services\Authorization\Matrix\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Bring the permissions catalogue up to the canonical registry.
 *
 * Adding a node to PermissionRegistry is not enough on its own. The Permission
 * Matrix renders every registry node, but RoleMatrixWriter resolves each change
 * against `permissions.code` — so a node the registry declares and the catalogue
 * lacks is displayed, is editable, and then fails the save with
 * CATALOG_OUT_OF_SYNC, which the API returns as a 409. The whole matrix save
 * fails, not just that row, because the write is one transaction.
 *
 * That is exactly what happened when the Company & Unit nodes were added: eleven
 * codes existed in the registry and none in the catalogue, and every attempt to
 * save any role's matrix that touched them answered 409 Conflict.
 *
 * `authz:sync-catalog` is the command that fixes it, but a command is not a
 * deployment step anyone remembers, and ProductionSafetyServiceProvider blocks
 * db:seed outright — so the sync has to travel with the migration that the
 * registry change ships in. It is idempotent: a catalogue already in step is
 * updated in place and nothing is created.
 *
 * PermissionCatalogSync preserves codes owned by the agent and employee portals
 * and the legacy namespace. That matters: an earlier synchroniser decided
 * ownership from the `ui.` prefix and deactivated both portals' codes.
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

    /**
     * Not reversed.
     *
     * Removing catalogue rows would strip the role_permissions that reference
     * them, silently revoking grants an administrator made. Rolling back a
     * registry addition is a deliberate act, not a side effect of this.
     */
    public function down(): void
    {
    }
};
