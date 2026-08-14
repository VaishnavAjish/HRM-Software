<?php

use Illuminate\Database\Migrations\Migration;

/**
 * NEUTRALISED — this migration is intentionally a no-op.
 *
 * Its original body granted broad create/update/delete permissions to the
 * `agent` and `recruitment_manager` roles, overwrote existing role_permissions
 * rows with ALLOW, assigned every agent user (type=agent or role=4) to BOTH
 * roles, created incomplete permission-catalog rows, and performed no matrix
 * audit or authorization-cache invalidation — with no rollback. It executed
 * against at least the local database before being contained.
 *
 * The executable body is removed so pending and fresh environments can never
 * receive those grants. The filename is preserved so the migrations ledger
 * stays consistent on databases that already recorded this entry.
 *
 * It is deliberately NOT turned into a corrective migration: the DENY / not-
 * assigned state the original overwrote cannot be reconstructed reliably, so
 * undoing it is a human-reviewed operation, not an automatic one. On a database
 * where the original already ran, use the read-only command
 *
 *     php artisan authz:audit-agent-migration
 *
 * to see exactly which roles, users, grants, DENY conflicts and scope
 * mismatches it produced, then repair the Permission Matrix by hand.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Intentionally empty. See the file header.
    }

    public function down(): void
    {
        // Intentionally empty. The original had no reversible rollback and the
        // prior grant state is not reconstructable; reversal is a human-reviewed
        // repair, guided by `php artisan authz:audit-agent-migration`.
    }
};
