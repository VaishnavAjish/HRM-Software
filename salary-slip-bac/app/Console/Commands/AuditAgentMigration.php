<?php

namespace App\Console\Commands;

use App\Support\PermissionRegistry;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Read-only forensic report on the neutralised agent-permission migration
 * (2026_08_14_000000_ensure_agent_and_recruitment_permissions).
 *
 * The migration body is now a no-op, but on databases where the original ran it
 * left broad grants, dual role assignments and possible DENY/scope conflicts
 * behind. This command surfaces exactly what it touched so an operator can
 * repair the Permission Matrix by hand.
 *
 * It is strictly read-only: it runs only SELECTs, never writes a role,
 * permission, assignment or decision/audit row, and never prints PII (names,
 * emails, phone numbers, Aadhaar). Internal numeric ids and permission/role
 * codes are the only identifiers reported.
 */
class AuditAgentMigration extends Command
{
    protected $signature = 'authz:audit-agent-migration
        {--limit=25 : Max ids to list per section}';

    protected $description = 'Read-only report on what the neutralised agent-permission migration changed (assignments, excess grants, DENY conflicts, scope mismatches). Writes nothing.';

    private const SOURCE = 'AGENT_PERMISSION_FIX';

    private const AGENT_ROLE_CODES = ['agent', 'recruitment_manager'];

    public function handle(): int
    {
        $limit = max(1, (int) $this->option('limit'));

        if (! Schema::hasTable('roles') || ! Schema::hasTable('role_permissions') || ! Schema::hasTable('permissions')) {
            $this->warn('RBAC tables are not present in this database; nothing to audit.');

            return self::SUCCESS;
        }

        $this->info('Read-only audit of the neutralised agent-permission migration. No changes are written.');
        $this->newLine();

        $this->reportAssignments($limit);
        $this->reportAgentsWithRecruitmentManager($limit);
        $this->reportExcessGrants();
        $this->reportDenyConflicts();
        $this->reportScopeMismatches($limit);

        $this->newLine();
        $this->info('Audit complete. Nothing was modified. Repair the Permission Matrix by hand where issues are reported above.');

        return self::SUCCESS;
    }

    /** 1. Roles and users touched by assignment_source = AGENT_PERMISSION_FIX. */
    private function reportAssignments(int $limit): void
    {
        $this->line('== Assignments created by the migration (assignment_source = ' . self::SOURCE . ') ==');

        if (! Schema::hasTable('authorization_role_assignments')) {
            $this->line('  authorization_role_assignments table absent — skipped.');
            $this->newLine();

            return;
        }

        $rows = DB::table('authorization_role_assignments as ara')
            ->leftJoin('roles as r', 'r.id', '=', 'ara.role_id')
            ->where('ara.assignment_source', self::SOURCE)
            ->get(['ara.user_id', 'ara.role_id', 'r.code as role_code']);

        if ($rows->isEmpty()) {
            $this->line('  None. The migration created no assignments on this database.');
            $this->newLine();

            return;
        }

        $byRole = [];
        $userIds = [];
        foreach ($rows as $row) {
            $code = $row->role_code ?: ('role#' . $row->role_id);
            $byRole[$code] = ($byRole[$code] ?? 0) + 1;
            $userIds[(int) $row->user_id] = true;
        }

        foreach ($byRole as $code => $count) {
            $this->line(sprintf('  role "%s": %d assignment(s)', $code, $count));
        }
        $this->line(sprintf('  distinct users affected: %d', count($userIds)));
        $this->line('  user ids: ' . $this->idList(array_keys($userIds), $limit));
        $this->newLine();
    }

    /** 2. Agent-type users assigned to the recruitment_manager role. */
    private function reportAgentsWithRecruitmentManager(int $limit): void
    {
        $this->line('== Agent users also assigned Recruitment Manager ==');

        $rmRoleId = DB::table('roles')->where('code', 'recruitment_manager')->value('id');
        if (! $rmRoleId) {
            $this->line('  recruitment_manager role not present — skipped.');
            $this->newLine();

            return;
        }

        $agentUserIds = DB::table('users')
            ->where(fn ($q) => $q->where('type', 'agent')->orWhere('role', 4))
            ->pluck('id')
            ->map(fn ($id) => (int) $id)
            ->all();

        if ($agentUserIds === []) {
            $this->line('  No agent-type users on this database.');
            $this->newLine();

            return;
        }

        $withRm = [];

        if (Schema::hasTable('authorization_role_assignments')) {
            $withRm = array_merge($withRm, DB::table('authorization_role_assignments')
                ->where('role_id', $rmRoleId)
                ->whereIn('user_id', $agentUserIds)
                ->pluck('user_id')->map(fn ($id) => (int) $id)->all());
        }

        if (Schema::hasTable('user_roles')) {
            $withRm = array_merge($withRm, DB::table('user_roles')
                ->where('role_id', $rmRoleId)
                ->whereIn('user_id', $agentUserIds)
                ->pluck('user_id')->map(fn ($id) => (int) $id)->all());
        }

        $withRm = array_values(array_unique($withRm));

        if ($withRm === []) {
            $this->line('  None. No agent user currently holds recruitment_manager.');
        } else {
            $this->line(sprintf('  %d agent user(s) hold recruitment_manager (agents should not inherit it):', count($withRm)));
            $this->line('  user ids: ' . $this->idList($withRm, $limit));
        }
        $this->newLine();
    }

    /**
     * 3. ALLOW grants on the agent roles that exceed what their currently
     *    allowed Agent Portal nodes imply.
     */
    private function reportExcessGrants(): void
    {
        $this->line('== Grants exceeding the roles\' allowed Agent Portal implications ==');

        $portalNodes = array_values(array_filter(
            array_keys(PermissionRegistry::all()),
            fn ($key) => $key === 'ui.portals' || str_starts_with($key, 'ui.portals.agent')
        ));

        $flagged = false;

        foreach (self::AGENT_ROLE_CODES as $roleCode) {
            $role = DB::table('roles')->where('code', $roleCode)->first();
            if (! $role) {
                continue;
            }

            $held = DB::table('role_permissions as rp')
                ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
                ->where('rp.role_id', $role->id)
                ->get(['p.code', 'rp.effect']);

            $allowed = [];
            foreach ($held as $row) {
                if (strtoupper((string) ($row->effect ?? 'ALLOW')) === 'ALLOW') {
                    $allowed[(string) $row->code] = true;
                }
            }

            // Everything the role's allowed agent-portal nodes legitimately imply.
            $implied = [];
            foreach ($portalNodes as $node) {
                if (! isset($allowed[$node])) {
                    continue;
                }
                $implied[$node] = true;
                foreach (PermissionRegistry::impliedCodes($node) as $code) {
                    $implied[$code] = true;
                }
                foreach (PermissionRegistry::requiredCodesFor($node) as $code) {
                    $implied[$code] = true;
                }
            }

            // Business (non-ui.) ALLOW grants not covered by those implications.
            $excess = [];
            foreach (array_keys($allowed) as $code) {
                if (str_starts_with($code, 'ui.')) {
                    continue;
                }
                if (! isset($implied[$code])) {
                    $excess[] = $code;
                }
            }
            sort($excess);

            if ($excess === []) {
                $this->line(sprintf('  role "%s": no excess business grants.', $roleCode));

                continue;
            }

            $flagged = true;
            $this->line(sprintf('  role "%s": %d grant(s) beyond its allowed agent-portal nodes:', $roleCode, count($excess)));
            foreach ($excess as $code) {
                $this->line('    - ' . $code);
            }
        }

        if (! $flagged) {
            $this->line('  (Review the lists above; "no excess" means grants match the portal implications.)');
        }
        $this->newLine();
    }

    /** 4. Explicit DENY rows on the agent roles (conflicts with blanket ALLOW). */
    private function reportDenyConflicts(): void
    {
        $this->line('== Explicit DENY conflicts on the agent roles ==');

        $found = false;

        foreach (self::AGENT_ROLE_CODES as $roleCode) {
            $role = DB::table('roles')->where('code', $roleCode)->first();
            if (! $role) {
                continue;
            }

            $denies = DB::table('role_permissions as rp')
                ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
                ->where('rp.role_id', $role->id)
                ->whereRaw('UPPER(COALESCE(rp.effect, \'ALLOW\')) = ?', ['DENY'])
                ->pluck('p.code')
                ->all();

            if ($denies === []) {
                continue;
            }

            $found = true;
            sort($denies);
            $this->line(sprintf('  role "%s" holds %d DENY row(s) that a blanket ALLOW grant would contradict:', $roleCode, count($denies)));
            foreach ($denies as $code) {
                $this->line('    - ' . $code);
            }
        }

        if (! $found) {
            $this->line('  None on the agent roles.');
        }
        $this->newLine();
    }

    /** 5. Tenant / scope mismatches, including CSV scope_id values. */
    private function reportScopeMismatches(int $limit): void
    {
        $this->line('== Tenant / scope mismatches on migration assignments ==');

        if (! Schema::hasTable('authorization_role_assignments')) {
            $this->line('  authorization_role_assignments table absent — skipped.');
            $this->newLine();

            return;
        }

        $rows = DB::table('authorization_role_assignments as ara')
            ->leftJoin('users as u', 'u.id', '=', 'ara.user_id')
            ->where('ara.assignment_source', self::SOURCE)
            ->get(['ara.id', 'ara.user_id', 'ara.scope_id', 'ara.tenant_id', 'u.company_code']);

        if ($rows->isEmpty()) {
            $this->line('  No migration assignments to check.');
            $this->newLine();

            return;
        }

        $csv = [];
        $outOfScope = [];

        foreach ($rows as $row) {
            $scope = (string) ($row->scope_id ?? '');

            if (str_contains($scope, ',')) {
                $csv[] = (int) $row->user_id;

                continue;
            }

            $membership = array_map('trim', explode(',', (string) ($row->company_code ?? '')));
            if ($scope !== '' && ! in_array($scope, $membership, true) && ! in_array($scope, ['all', 'all-companies'], true)) {
                $outOfScope[] = (int) $row->user_id;
            }
        }

        if ($csv === [] && $outOfScope === []) {
            $this->line('  None. All migration assignment scopes are single, in-membership company codes.');
        } else {
            if ($csv !== []) {
                $this->line(sprintf('  %d assignment(s) have a CSV scope_id (should be one company): user ids %s',
                    count($csv), $this->idList(array_values(array_unique($csv)), $limit)));
            }
            if ($outOfScope !== []) {
                $this->line(sprintf('  %d assignment(s) scope a company outside the user\'s membership: user ids %s',
                    count($outOfScope), $this->idList(array_values(array_unique($outOfScope)), $limit)));
            }
        }
        $this->newLine();
    }

    /** A bounded, comma-separated id list (internal ids only — never PII). */
    private function idList(array $ids, int $limit): string
    {
        sort($ids);
        $shown = array_slice($ids, 0, $limit);
        $out = implode(', ', $shown);

        if (count($ids) > $limit) {
            $out .= sprintf(' … (+%d more)', count($ids) - $limit);
        }

        return $out === '' ? '(none)' : $out;
    }
}
