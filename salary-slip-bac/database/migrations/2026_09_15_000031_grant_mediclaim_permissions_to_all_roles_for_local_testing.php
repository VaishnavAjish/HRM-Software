<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Local-testing convenience grant: the Mediclaim permission codes seeded by
 * `2026_09_15_000028_seed_mediclaim_permissions.php` were deliberately left
 * ungranted (brand-new module, no legacy permission to copy grants from —
 * see that migration's own docblock). AUTHZ_MODE=shadow does NOT rescue an
 * ungranted brand-new permission the way it does for an existing one: the
 * shadow fallback only re-admits a request the *old* legacy system would
 * have allowed (`RequirePermission::handle()`'s `$decision->legacyDecision`
 * check), and there is no legacy equivalent for a code like
 * `self.mediclaim.member.read` to fall back to — so every Mediclaim
 * endpoint 403s for every role until someone explicitly grants it.
 *
 * This migration grants every `mediclaim.*` / `self.mediclaim.*` permission
 * to every active role, so the feature is immediately usable while testing
 * locally, without hand-clicking through the Permission Matrix first. Real
 * per-role scoping (e.g. only HR holds `mediclaim.claim.hr_verification.decide`)
 * should be set deliberately later via that same admin UI — this migration
 * is a blunt local-testing shortcut, not a permanent access model.
 *
 * Mirrors the existing `grant()`-if-absent pattern from
 * `2026_08_11_000009_activate_business_portal_capability.php`: never
 * overwrites an existing row (including an explicit prior DENY).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! app()->environment(['local', 'testing'])) {
            return;
        }

        if (! Schema::hasTable('permissions') || ! Schema::hasTable('roles') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        $permissionIds = DB::table('permissions')
            ->where('code', 'like', 'mediclaim.%')
            ->orWhere('code', 'like', 'self.mediclaim.%')
            ->orWhere('code', 'like', 'ui.tds.mediclaim%')
            ->orWhere('code', 'like', 'ui.portals.employee_mediclaim%')
            ->pluck('id');

        if ($permissionIds->isEmpty()) {
            return;
        }

        $roleIds = DB::table('roles')->where('is_active', true)->pluck('id');

        foreach ($roleIds as $roleId) {
            foreach ($permissionIds as $permissionId) {
                $this->grant((int) $roleId, (int) $permissionId);
            }
        }
    }

    public function down(): void
    {
        // Not reversed — this is a local-testing convenience grant, not a
        // schema change; revoking it here could also strip a grant someone
        // deliberately set afterward via the Permission Matrix in the
        // meantime, which this migration has no way to distinguish.
    }

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
};
