<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Give the approved business roles the management shell, and repair the parent
 * the registry change introduced.
 *
 * Two separate jobs, both idempotent.
 *
 * REPAIR. `ui.portals.agent_dashboard` and `ui.portals.employee_dashboard`
 * already declared `parent => ui.portals`, but no such node existed — they were
 * children of nothing, so the parent chain had nothing to require and each
 * resolved on its own. Adding the `ui.portals` module gave them a real parent,
 * and under the parent/child rule a child beneath an unassigned parent resolves
 * to DENY. Every role already holding one of those pages would have silently
 * lost it. On this database both holders happen to have the parent too, so
 * nothing broke here — but that is configuration, not a guarantee, and any other
 * deployment would break. This grants the parent wherever a child is held.
 *
 * ACTIVATE. ui.portals.business is what moves a role into the management shell.
 * The roles are named explicitly below rather than derived: "which roles are
 * approved for the management shell" is a business decision, and inferring it
 * from a name pattern or the legacy tier is exactly what this work removes.
 * Admin is included so its shell stops depending on the numeric tier fallback;
 * it changes nothing about what Admin may do.
 *
 * Granting a shell grants no page and no action. ui.access_control is resolved
 * independently, so a business role does not gain administrator authority by
 * being rendered in the same frame.
 */
return new class extends Migration
{
    /**
     * Roles approved for the management shell.
     *
     * An explicit allowlist, checked against the roles that actually exist. A
     * deployment without one of these simply skips it.
     */
    private const BUSINESS_SHELL_ROLES = ['admin', 'tenant_administrator', 'hr_manager', 'account'];

    public function up(): void
    {
        if (! Schema::hasTable('role_permissions') || ! Schema::hasTable('permissions')) {
            return;
        }

        $parentId = DB::table('permissions')->where('code', 'ui.portals')->value('id');
        $businessId = DB::table('permissions')->where('code', 'ui.portals.business')->value('id');

        if (! $parentId || ! $businessId) {
            // The catalogue sync has not run yet; the sync migration owns that.
            return;
        }

        $this->repairOrphanedChildren($parentId);

        foreach (self::BUSINESS_SHELL_ROLES as $code) {
            $roleId = DB::table('roles')->where('code', $code)->value('id');

            if (! $roleId) {
                continue;
            }

            $this->grant($roleId, $parentId);
            $this->grant($roleId, $businessId);
        }
    }

    /** Any role holding a ui.portals.* page must hold the module above it. */
    private function repairOrphanedChildren(int $parentId): void
    {
        $roleIds = DB::table('role_permissions')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('permissions.code', 'like', 'ui.portals.%')
            ->where('role_permissions.effect', 'ALLOW')
            ->distinct()
            ->pluck('role_permissions.role_id');

        foreach ($roleIds as $roleId) {
            $this->grant((int) $roleId, $parentId);
        }
    }

    /**
     * Grant unless the role already has a row for it.
     *
     * An existing row is left exactly as it is — including an explicit DENY.
     * Overwriting one would turn a migration into a silent policy change against
     * a decision somebody made deliberately in the Permission Matrix.
     */
    private function grant(int $roleId, int $permissionId): void
    {
        $exists = DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->where('permission_id', $permissionId)
            ->exists();

        if ($exists) {
            return;
        }

        $row = ['role_id' => $roleId, 'permission_id' => $permissionId];

        if (Schema::hasColumn('role_permissions', 'effect')) {
            $row['effect'] = 'ALLOW';
        }

        if (Schema::hasColumn('role_permissions', 'inherit_to_children')) {
            $row['inherit_to_children'] = true;
        }

        DB::table('role_permissions')->insert($row);
    }

    /**
     * Not reversed.
     *
     * Revoking a shell would strand whoever is using it, and the repair half is
     * a correction rather than a change — undoing it would reintroduce the
     * broken parent chain.
     */
    public function down(): void
    {
    }
};
