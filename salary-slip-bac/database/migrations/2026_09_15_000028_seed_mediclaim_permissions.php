<?php

use App\Services\Authorization\Matrix\PermissionCatalogSync;
use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Seeds every `mediclaim.*` / `self.mediclaim.*` business permission code
 * routes/mediclaim.php's middleware actually references, plus the two
 * registry-level codes (`ui.tds.mediclaim`, `ui.portals.employee_mediclaim`)
 * added in PermissionRegistry.php this phase.
 *
 * Cloned from 2026_08_14_010100_seed_job_requisition_approval_permissions.php.
 *
 * The CODES list below is the union of:
 *  - every `permission:` string in routes/mediclaim.php (ground truth — B4
 *    already resolved a couple of ambiguities the plan's reconciliation #6
 *    list didn't anticipate: `mediclaim.member_change_request.read`/`.decide`
 *    for the HR-side Admin\MemberChangeRequestController, not just the
 *    self-service `self.mediclaim.member_change_request.*` pair);
 *  - the plan's reconciliation #6 authoritative list (adds a handful of
 *    codes — `self.mediclaim.card.download`, `mediclaim.claim.reassign`,
 *    `mediclaim.card.create/.update/.download`, `mediclaim.rule_book.update`,
 *    `mediclaim.report.export/.reveal` — that the frontend already checks
 *    via can() for actions not yet wired to a dedicated route, e.g.
 *    useMediclaimAuthorization.js / formActionAccess.js / RuleBooksTab.jsx /
 *    ReportsTab.jsx all reference these verbatim, confirmed by grep).
 *
 * Unlike the job-requisition template's copyAllows() calls, no backfill call
 * is made here: Mediclaim is a brand-new module with no pre-existing merged
 * permission whose grants should carry forward onto these split codes. Real
 * grants happen through normal role administration after rollout, per the
 * plan's own "AUTHZ_MODE=shadow sequencing" note. The copyAllows() helper is
 * still cloned below so a later phase can call it without re-deriving the
 * role_permissions-copy logic, exactly like the template it comes from.
 */
return new class extends Migration
{
    private const CODES = [
        // ---------------------------------------------------- self-service
        'self.mediclaim.coverage.read' => ['read', 'READ', true],
        'self.mediclaim.member.read' => ['read', 'READ', true],
        'self.mediclaim.member_change_request.create' => ['create', 'WRITE', true],
        'self.mediclaim.member_change_request.read' => ['read', 'READ', true],
        'self.mediclaim.card.read' => ['read', 'READ', true],
        'self.mediclaim.card.download' => ['download', 'READ', true],
        'self.mediclaim.intimation.create' => ['create', 'WRITE', true],
        'self.mediclaim.intimation.read' => ['read', 'READ', true],
        'self.mediclaim.claim.create' => ['create', 'WRITE', true],
        'self.mediclaim.claim.read' => ['read', 'READ', true],
        'self.mediclaim.claim.update' => ['update', 'WRITE', true],
        'self.mediclaim.claim.submit' => ['submit', 'WRITE', true],
        'self.mediclaim.claim.withdraw' => ['withdraw', 'WRITE', true],
        'self.mediclaim.document.upload' => ['upload', 'WRITE', true],
        'self.mediclaim.document.download' => ['download', 'READ', true],

        // ------------------------------------------- manager / reviewer / staff
        'mediclaim.team_claim.read' => ['read', 'READ', true],
        'mediclaim.claim.manager.decide' => ['decide', 'WRITE', true],
        'mediclaim.claim_document.upload' => ['upload', 'WRITE', true],
        'mediclaim.claim_document.download' => ['download', 'READ', true],
        'mediclaim.claim.coordinator.decide' => ['decide', 'WRITE', true],
        'mediclaim.claim.committee.decide' => ['decide', 'WRITE', true],
        'mediclaim.claim.hr_verification.decide' => ['decide', 'WRITE', true],
        'mediclaim.claim.director.decide' => ['decide', 'WRITE', true],
        'mediclaim.claim.reassign' => ['reassign', 'WRITE', true],
        'mediclaim.claim.read' => ['read', 'READ', true],
        // HR-side member-change decisioning — B4 addition, not in the plan's
        // reconciliation #6 list (see routes/mediclaim.php's own docblock).
        'mediclaim.member_change_request.read' => ['read', 'READ', true],
        'mediclaim.member_change_request.decide' => ['decide', 'WRITE', true],

        // ---------------------------------------------- admin / configuration
        'mediclaim.policy.read' => ['read', 'READ', false],
        'mediclaim.policy.create' => ['create', 'WRITE', false],
        'mediclaim.policy.update' => ['update', 'WRITE', false],
        'mediclaim.policy.publish' => ['publish', 'WRITE', false],
        'mediclaim.enrollment.read' => ['read', 'READ', true],
        'mediclaim.enrollment.create' => ['create', 'WRITE', true],
        'mediclaim.enrollment.update' => ['update', 'WRITE', true],
        'mediclaim.card.create' => ['create', 'WRITE', true],
        'mediclaim.card.update' => ['update', 'WRITE', true],
        'mediclaim.card.download' => ['download', 'READ', true],
        'mediclaim.hospital.read' => ['read', 'READ', false],
        'mediclaim.hospital.create' => ['create', 'WRITE', false],
        'mediclaim.hospital.update' => ['update', 'WRITE', false],
        'mediclaim.hospital.delete' => ['delete', 'WRITE', false],
        'mediclaim.rule_book.read' => ['read', 'READ', false],
        'mediclaim.rule_book.create' => ['create', 'WRITE', false],
        'mediclaim.rule_book.update' => ['update', 'WRITE', false],
        'mediclaim.rule_book.publish' => ['publish', 'WRITE', false],
        'mediclaim.reviewer_assignment.read' => ['read', 'READ', false],
        'mediclaim.reviewer_assignment.assign' => ['assign', 'WRITE', false],
        'mediclaim.settlement.create' => ['create', 'WRITE', true],
        'mediclaim.settlement.read' => ['read', 'READ', true],
        'mediclaim.report.read' => ['read', 'READ', true],
        'mediclaim.report.export' => ['export', 'WRITE', true],
        'mediclaim.report.reveal' => ['reveal', 'WRITE', true],
        'mediclaim.audit.read' => ['read', 'READ', true],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        // Projects the registry (incl. this phase's new ui.tds.mediclaim,
        // ui.tds.mediclaim.card_generate, ui.tds.mediclaim.reviewer_assignment
        // and ui.portals.employee_mediclaim nodes) into the permissions
        // catalogue before the business codes below are inserted, per B5's
        // instructions.
        app(PermissionCatalogSync::class)->sync();

        $groupId = Schema::hasTable('permission_groups')
            ? DB::table('permission_groups')->where('name', 'Mediclaim')->value('id')
            : null;

        foreach (self::CODES as $code => [$action, $level, $sensitive]) {
            $id = DB::table('permissions')->where('code', $code)->value('id');
            if ($id === null) {
                DB::table('permissions')->insert([
                    'name' => $code,
                    'code' => $code,
                    'resource' => str($code)->beforeLast('.')->toString(),
                    'action' => $action,
                    'level' => $level,
                    'group_id' => $groupId,
                    'description' => ucwords(str_replace(['.', '_'], ' ', $code)),
                    'is_sensitive' => $sensitive,
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        // No copyAllows() calls — see file docblock: brand-new module, no
        // legacy merged permission to backfill grants from.

        // The migration writes role_permissions directly (via sync()'s own
        // inserts, if any role already held a colliding legacy code), so
        // explicitly move the authorization cache namespace before any user
        // refreshes a stale snapshot after deployment.
        app(AuthorizationCache::class)->invalidate();
    }

    public function down(): void
    {
        // Additive compatibility grants are intentionally not revoked on rollback.
    }

    private function copyAllows(string $sourceCode, array $targetCodes): void
    {
        $sourceId = DB::table('permissions')->where('code', $sourceCode)->value('id');
        if ($sourceId === null) {
            return;
        }

        $roleIds = DB::table('role_permissions')
            ->where('permission_id', $sourceId)
            ->where('effect', 'ALLOW')
            ->pluck('role_id');

        foreach ($targetCodes as $targetCode) {
            $targetId = DB::table('permissions')->where('code', $targetCode)->value('id');
            if ($targetId === null) {
                continue;
            }
            foreach ($roleIds as $roleId) {
                DB::table('role_permissions')->insertOrIgnore([
                    'role_id' => $roleId,
                    'permission_id' => $targetId,
                    'effect' => 'ALLOW',
                    'obligations' => null,
                    'inherit_to_children' => true,
                ]);
            }
        }
    }
};
