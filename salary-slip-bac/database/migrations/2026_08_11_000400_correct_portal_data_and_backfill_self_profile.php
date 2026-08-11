<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Two data corrections the capability work exposed. Neither names a role.
 *
 * WRONG SHELL'S LANDING PAGES. Some roles approved for the management shell also
 * carry agent-shell pages, granted long before ui.portals.* existed and before
 * those pages declared routes. Harmless while nothing resolved them; now that
 * /agent is governed, such a role can open the agent portal. The rule is
 * structural — a role holding the business shell but not the agent shell has no
 * business holding the agent shell's pages — so it is expressed against the
 * permission codes and applies to whatever roles happen to match.
 *
 * SELF-PROFILE. /api/profile and /api/profile-update carry no permission at all,
 * so every authenticated caller reaches them. Gating them is right, but the
 * order matters: self.profile.read and self.profile.update are held today by
 * almost nothing — the administrator role holds neither — so attaching the
 * middleware first would lock administrators out of their own profile on the
 * very next request. This grants the codes to every role that has not been given
 * an explicit decision about them, and the route change ships with it.
 *
 * An existing row is never overwritten, so a deliberate DENY survives both
 * halves.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('role_permissions') || ! Schema::hasTable('permissions')) {
            return;
        }

        $this->revokeForeignShellPages();
        $this->backfillSelfProfile();
    }

    /**
     * Agent-shell pages held by roles that are in the business shell, not the
     * agent one. Selected by code so no role is named.
     */
    private function revokeForeignShellPages(): void
    {
        $businessId = DB::table('permissions')->where('code', 'ui.portals.business')->value('id');
        $agentShellId = DB::table('permissions')->where('code', 'ui.portals.agent')->value('id');

        if (! $businessId) {
            return;
        }

        $businessRoles = DB::table('role_permissions')
            ->where('permission_id', $businessId)->where('effect', 'ALLOW')
            ->pluck('role_id');

        $agentShellRoles = $agentShellId
            ? DB::table('role_permissions')
                ->where('permission_id', $agentShellId)->where('effect', 'ALLOW')
                ->pluck('role_id')->all()
            : [];

        $targets = array_diff($businessRoles->all(), $agentShellRoles);

        if ($targets === []) {
            return;
        }

        $agentPageIds = DB::table('permissions')
            ->where('code', 'like', 'ui.portals.agent%')
            ->where('code', '!=', 'ui.portals.agent')
            ->pluck('id');

        if ($agentPageIds->isEmpty()) {
            return;
        }

        DB::table('role_permissions')
            ->whereIn('role_id', $targets)
            ->whereIn('permission_id', $agentPageIds)
            ->where('effect', 'ALLOW')
            ->delete();
    }

    /** Every role gets its own profile unless somebody decided otherwise. */
    private function backfillSelfProfile(): void
    {
        foreach (['self.profile.read', 'self.profile.update'] as $code) {
            $permissionId = DB::table('permissions')->where('code', $code)->value('id');

            if (! $permissionId) {
                continue;
            }

            $already = DB::table('role_permissions')
                ->where('permission_id', $permissionId)
                ->pluck('role_id')->all();

            $rows = DB::table('roles')
                ->whereNotIn('id', $already ?: [0])
                ->pluck('id')
                ->map(fn ($roleId) => [
                    'role_id' => $roleId,
                    'permission_id' => $permissionId,
                    'effect' => 'ALLOW',
                    'inherit_to_children' => true,
                ])->all();

            if ($rows !== []) {
                DB::table('role_permissions')->insert($rows);
            }
        }
    }

    /**
     * Not reversed.
     *
     * Re-granting the agent pages would hand the agent portal back to roles that
     * should not have had it, and dropping the profile grants would lock every
     * account out of its own profile now that the routes enforce them.
     */
    public function down(): void
    {
    }
};
