<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `document.file.read` / `document.file.download` were only ever granted to
 * `hr_manager` / `recruitment_manager` / `tenant_administrator` /
 * `super_administrator` in `RbacSeeder` ('Documents' group is matched into
 * `$hrCodes`/`$recruitmentCodes` via the `document.` prefix, but the
 * `employee` role's grant list is built from `self.`/`ui.employee.`/
 * `hr.profile.read` only — see RbacSeeder::run()). The legacy fallback in
 * `AuthorizationEngine::legacyDecision()` doesn't cover the gap either: the
 * `employee` legacy role only matches `self.`/`payroll.payslip.read`/
 * `hr.profile.` prefixes, not `document.`. So both the new engine and the
 * legacy shadow-mode fallback deny an employee viewing/downloading ANY
 * document (their own Mediclaim card, claim attachments, etc.) via
 * `POST /v1/documents/{id}/view-url` and `.../download-url` — a hard 403
 * "You are not permitted to perform this action.", not something shadow mode
 * can rescue since there's no legacy allow to fall back to.
 *
 * Grants read/download only (not upload/update/delete/restore) — an
 * employee should be able to open a document already linked to their own
 * record; per-document ownership/scope is still enforced separately by
 * DocumentAuthorizer. Mirrors the guarded, additive `grant()`-if-absent
 * pattern from `2026_09_15_000031_grant_mediclaim_permissions_to_all_roles_for_local_testing.php`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('roles') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        $roleId = DB::table('roles')->where('code', 'employee')->value('id');

        if (! $roleId) {
            return;
        }

        $permissionIds = DB::table('permissions')
            ->whereIn('code', ['document.file.read', 'document.file.download'])
            ->pluck('id');

        foreach ($permissionIds as $permissionId) {
            $this->grant((int) $roleId, (int) $permissionId);
        }
    }

    public function down(): void
    {
        // Not reversed — see the note on the migration this mirrors: revoking
        // here could also strip a grant someone deliberately set afterward
        // via the Permission Matrix, which this migration can't distinguish.
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
