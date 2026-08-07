<?php

namespace App\Services\Authorization\Matrix;

use App\Support\PermissionOwnership;
use App\Support\PermissionRegistry;
use App\Support\SystemRoles;
use Illuminate\Support\Facades\DB;

/**
 * Does every decision an ordinary role relies on today have an accounted-for
 * canonical equivalent?
 *
 * That is the only question this answers, and it answers it read-only. Nothing
 * here writes: a report that fixes what it measures cannot be trusted to tell
 * you whether enforcement is safe to switch on.
 *
 * Three separations do the real work:
 *
 *  - Ordinary roles from the protected identity. The hidden super admin holds
 *    materialised rows for most of the catalogue, and counting them made stale
 *    legacy codes look like production dependencies.
 *  - Core-owned permissions from everyone else's. A role may legitimately hold
 *    an employee-portal or unknown code; that is visible, but it is not an HRMS
 *    migration defect and core must not migrate it.
 *  - Configured state from effective access. This measures what is configured.
 *    Whether inheritance would grant something anyway is a different question.
 */
class PermissionMigrationReport
{
    /* mapping shape */
    public const EXACT = 'EXACT';
    public const ONE_TO_MANY = 'ONE_TO_MANY';
    public const MANY_TO_ONE = 'MANY_TO_ONE';

    /* migration outcome */
    public const MIGRATED = 'MIGRATED';
    public const PENDING = 'PENDING';
    public const UNMAPPED = 'UNMAPPED';
    public const AMBIGUOUS = 'AMBIGUOUS';
    public const MISMATCH = 'DECISION_MISMATCH';
    public const UNSUPPORTED = 'UNSUPPORTED';

    /* orphan partitions */
    public const HELD_BY_ORDINARY_ROLE = 'HELD_BY_ORDINARY_ROLE';
    public const HELD_ONLY_BY_PROTECTED_ROLE = 'HELD_ONLY_BY_PROTECTED_ROLE';
    public const UNHELD = 'UNHELD';

    public function build(): array
    {
        $roles = DB::table('roles')->get(['id', 'name', 'code', 'role_type']);
        $protectedCodes = SystemRoles::protectedCodes();

        $ordinary = $roles->reject(fn ($role) => in_array((string) $role->code, $protectedCodes, true));
        $protected = $roles->filter(fn ($role) => in_array((string) $role->code, $protectedCodes, true));

        $grants = $this->grantsByRole($roles->pluck('id')->all());

        $rows = [];
        $totals = [
            'roles' => 0, 'legacy' => 0, 'mapped' => 0, 'migrated' => 0, 'pending' => 0,
            'unmapped' => 0, 'ambiguous' => 0, 'mismatch' => 0, 'unsupported' => 0,
            'otherOwner' => 0, 'unknownOwner' => 0,
        ];

        foreach ($ordinary as $role) {
            $analysis = $this->analyseRole($grants[$role->id] ?? []);

            $rows[] = [
                'roleId' => $role->id,
                'roleName' => $role->name,
                'roleCode' => $role->code,
                'roleType' => $role->role_type,
                'legacyDecisions' => $analysis['legacyCount'],
                'canonicalDecisions' => $analysis['canonicalCount'],
                'migrated' => count($analysis['migrated']),
                'pending' => count($analysis['pending']),
                'unmapped' => count($analysis['unmapped']),
                'ambiguous' => count($analysis['ambiguous']),
                'mismatch' => count($analysis['mismatch']),
                'unsupported' => count($analysis['unsupported']),
                'otherOwners' => count($analysis['otherOwners']),
                'unknownOwners' => count($analysis['unknownOwners']),
                'status' => $this->statusOf($analysis),
                'details' => $analysis,
            ];

            $totals['roles']++;
            $totals['legacy'] += $analysis['legacyCount'];
            $totals['migrated'] += count($analysis['migrated']);
            $totals['pending'] += count($analysis['pending']);
            $totals['unmapped'] += count($analysis['unmapped']);
            $totals['ambiguous'] += count($analysis['ambiguous']);
            $totals['mismatch'] += count($analysis['mismatch']);
            $totals['unsupported'] += count($analysis['unsupported']);
            $totals['otherOwner'] += count($analysis['otherOwners']);
            $totals['unknownOwner'] += count($analysis['unknownOwners']);
        }

        $totals['mapped'] = $totals['legacy'] - $totals['unmapped'];

        return [
            'roles' => $rows,
            'totals' => $totals,
            'orphans' => $this->orphanLegacyCodes($grants, $ordinary->pluck('id')->all(), $protected->pluck('id')->all()),
            'protectedRoles' => $this->protectedRoleReport($protected, $grants),
            'blockers' => $this->blockers($rows),
            'generatedAt' => now()->toIso8601String(),
        ];
    }

    /**
     * Analyse one ordinary role's configured decisions.
     *
     * Every row is placed in exactly one bucket, so nothing a role holds can
     * quietly vanish from the report.
     */
    private function analyseRole(array $held): array
    {
        $migrated = [];
        $pending = [];
        $unmapped = [];
        $ambiguous = [];
        $mismatch = [];
        $unsupported = [];
        $otherOwners = [];
        $unknownOwners = [];

        $legacyCount = 0;
        $canonicalCount = 0;

        foreach ($held as $code => $state) {
            $owner = PermissionOwnership::ownerOf($code);

            if ($owner === PermissionOwnership::HRMS_CORE) {
                $canonicalCount++;
                continue;
            }

            if ($owner === PermissionOwnership::UNKNOWN) {
                // Ownership has to be resolved before anyone can decide what
                // migrating it would even mean.
                $unknownOwners[] = ['code' => $code, 'state' => $state, 'owner' => $owner];
                continue;
            }

            if ($owner !== PermissionOwnership::LEGACY) {
                // Another surface owns it. Visible, never migrated by core, and
                // not an HRMS defect — including the DENY rows EMP and ACC carry.
                $otherOwners[] = ['code' => $code, 'state' => $state, 'owner' => $owner];
                continue;
            }

            $legacyCount++;

            $targets = array_values(array_filter(
                PermissionRegistry::nodesImplying($code),
                fn ($node) => PermissionOwnership::isCoreOwned($node),
            ));

            $entry = ['legacyCode' => $code, 'legacyState' => $state, 'targets' => $targets];

            if ($targets === []) {
                $unmapped[] = $entry + ['reason' => 'No canonical node declares this business permission.'];
                continue;
            }

            $entry['shape'] = $this->shapeOf($code, $targets);

            if ($state === 'CONDITIONAL') {
                // Conditional migration semantics do not exist yet; claiming these
                // are migrated would silently downgrade them to a plain grant.
                $unsupported[] = $entry + ['reason' => 'Conditional migration semantics are not implemented.'];
                continue;
            }

            $heldTargets = array_values(array_filter($targets, fn ($t) => isset($held[$t])));

            if ($heldTargets === []) {
                // Several plausible targets and no canonical decision to disambiguate.
                count($targets) > 1
                    ? $ambiguous[] = $entry + ['reason' => 'Several canonical capabilities imply this code and none is configured.']
                    : $pending[] = $entry + ['reason' => 'Canonical equivalent exists but is not configured on this role.'];

                continue;
            }

            $verdict = $this->reconcile($state, $heldTargets, $held);

            $entry['canonicalStates'] = array_map(fn ($t) => $held[$t], $heldTargets);
            $entry['heldTargets'] = $heldTargets;

            $verdict === self::MIGRATED
                ? $migrated[] = $entry
                : $mismatch[] = $entry + ['reason' => "Legacy {$state} is not reproduced by the canonical configuration."];
        }

        return compact(
            'legacyCount', 'canonicalCount', 'migrated', 'pending', 'unmapped',
            'ambiguous', 'mismatch', 'unsupported', 'otherOwners', 'unknownOwners',
        );
    }

    /**
     * Does the canonical configuration actually reproduce the legacy decision?
     *
     * A canonical row existing is not migration. A legacy ALLOW answered by a
     * canonical DENY is a behaviour change waiting to happen at cutover, and a
     * legacy DENY answered by any canonical ALLOW would re-grant access the role
     * is currently refused — because a canonical grant projects onto the very
     * business code the legacy row denies.
     */
    private function reconcile(string $legacyState, array $heldTargets, array $held): string
    {
        if ($legacyState === 'ALLOW') {
            foreach ($heldTargets as $target) {
                if ($held[$target] === 'ALLOW') {
                    return self::MIGRATED;
                }
            }

            return self::MISMATCH;
        }

        if ($legacyState === 'DENY') {
            foreach ($heldTargets as $target) {
                if ($held[$target] !== 'DENY') {
                    return self::MISMATCH;
                }
            }

            return self::MIGRATED;
        }

        return self::MISMATCH;
    }

    private function shapeOf(string $legacyCode, array $targets): string
    {
        if (count($targets) > 1) {
            return self::ONE_TO_MANY;
        }

        $node = PermissionRegistry::node($targets[0]);

        return count($node['implies'] ?? []) > 1 ? self::MANY_TO_ONE : self::EXACT;
    }

    private function statusOf(array $analysis): string
    {
        if ($analysis['unmapped'] || $analysis['ambiguous'] || $analysis['mismatch'] || $analysis['unknownOwners']) {
            return 'FAIL';
        }

        return ($analysis['pending'] || $analysis['unsupported']) ? 'PARTIAL' : 'PASS';
    }

    /** Every blocking item, named so the cause is actionable rather than a count. */
    private function blockers(array $rows): array
    {
        $out = [];

        foreach ($rows as $row) {
            foreach ($row['details']['unmapped'] as $item) {
                $out[] = $this->blocker($row, 'UNMAPPED_ACTIVE_PERMISSION', $item);
            }

            foreach ($row['details']['ambiguous'] as $item) {
                $out[] = $this->blocker($row, 'AMBIGUOUS_ACTIVE_PERMISSION', $item);
            }

            foreach ($row['details']['mismatch'] as $item) {
                $out[] = $this->blocker($row, 'DECISION_MISMATCH', $item);
            }

            foreach ($row['details']['unknownOwners'] as $item) {
                $out[] = [
                    'role' => $row['roleCode'],
                    'reason' => 'UNKNOWN_OWNER_ACTIVE_GRANT',
                    'legacy' => $item['code'],
                    'legacyState' => $item['state'],
                    'canonical' => null,
                    'detail' => 'Ownership must be resolved before this decision can be migrated.',
                ];
            }
        }

        return $out;
    }

    private function blocker(array $row, string $reason, array $item): array
    {
        return [
            'role' => $row['roleCode'],
            'reason' => $reason,
            'legacy' => $item['legacyCode'],
            'legacyState' => $item['legacyState'],
            'canonical' => isset($item['heldTargets']) ? implode(', ', $item['heldTargets']) : implode(', ', $item['targets'] ?? []),
            'canonicalState' => isset($item['canonicalStates']) ? implode(', ', $item['canonicalStates']) : null,
            'detail' => $item['reason'] ?? null,
        ];
    }

    /**
     * Legacy codes no canonical node references, partitioned by who holds them.
     *
     * A stale catalogue is not a production blocker. Only codes an ordinary role
     * actually holds can break at cutover, so the partitions keep the other three
     * groups visible without letting them fail the gate.
     */
    private function orphanLegacyCodes(array $grants, array $ordinaryIds, array $protectedIds): array
    {
        $referenced = array_flip(PermissionRegistry::impliedPermissionCodes());

        $codes = DB::table('permissions')
            ->pluck('code')
            ->map('strval')
            ->filter(fn ($code) => PermissionOwnership::ownerOf($code) === PermissionOwnership::LEGACY)
            ->reject(fn ($code) => isset($referenced[$code]))
            ->values();

        $ordinaryHeld = $this->codesHeldBy($grants, $ordinaryIds);
        $protectedHeld = $this->codesHeldBy($grants, $protectedIds);

        $partitions = [
            self::HELD_BY_ORDINARY_ROLE => [],
            self::HELD_ONLY_BY_PROTECTED_ROLE => [],
            self::UNHELD => [],
        ];

        foreach ($codes as $code) {
            if (isset($ordinaryHeld[$code])) {
                $partitions[self::HELD_BY_ORDINARY_ROLE][] = $code;
            } elseif (isset($protectedHeld[$code])) {
                $partitions[self::HELD_ONLY_BY_PROTECTED_ROLE][] = $code;
            } else {
                $partitions[self::UNHELD][] = $code;
            }
        }

        return ['total' => $codes->count(), 'partitions' => $partitions];
    }

    private function codesHeldBy(array $grants, array $roleIds): array
    {
        $out = [];

        foreach ($roleIds as $id) {
            foreach (array_keys($grants[$id] ?? []) as $code) {
                $out[$code] = true;
            }
        }

        return $out;
    }

    /** Protected identity rows: reported, excluded from the ordinary gate. */
    private function protectedRoleReport($protectedRoles, array $grants): array
    {
        $out = [];

        foreach ($protectedRoles as $role) {
            $out[] = [
                'roleName' => $role->name,
                'roleCode' => $role->code,
                'materialisedGrants' => count($grants[$role->id] ?? []),
                'excludedFromGate' => true,
                'reason' => 'Protected identity access is a system rule; its materialised rows are Phase 18 remediation, not ordinary migration coverage.',
            ];
        }

        return $out;
    }

    /** @return array<int,array<string,string>> roleId => [code => state] */
    private function grantsByRole(array $roleIds): array
    {
        if ($roleIds === []) {
            return [];
        }

        $rows = DB::table('role_permissions as rp')
            ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
            ->whereIn('rp.role_id', $roleIds)
            ->get(['rp.role_id', 'p.code', 'rp.effect', 'rp.conditions']);

        $out = [];

        foreach ($rows as $row) {
            $out[(int) $row->role_id][(string) $row->code] = $this->stateOf($row);
        }

        return $out;
    }

    private function stateOf(object $row): string
    {
        if (strtoupper((string) ($row->effect ?? 'ALLOW')) === 'DENY') {
            return 'DENY';
        }

        $conditions = $row->conditions ?? null;

        if (is_string($conditions)) {
            $conditions = json_decode($conditions, true);
        }

        return is_array($conditions) && $conditions !== [] ? 'CONDITIONAL' : 'ALLOW';
    }
}
