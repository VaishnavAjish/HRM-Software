<?php

namespace App\Services\Authorization\Matrix;

use App\Models\Role;
use App\Services\Authorization\SchemaSupport;
use App\Support\PermissionRegistry;
use Illuminate\Support\Facades\DB;

/**
 * Builds the Permission Matrix for one role from the canonical registry.
 *
 * The registry is the source of truth for what the tree contains; the database
 * only supplies which of those nodes the role has been configured with. A node
 * the application has but the catalogue lacks therefore still appears, flagged
 * by the validator, rather than silently vanishing from the matrix and leaving
 * an unauthorized surface nobody can see.
 */
class RoleMatrixBuilder
{
    /** Matches authorization_role_inheritances.max_depth. */
    private const MAX_DEPTH = 8;

    public function __construct(private readonly EffectiveStateResolver $resolver)
    {
    }

    public function build(Role $role): array
    {
        $ancestors = $this->ancestors($role->id);
        $direct = $this->grantsFor([$role->id]);
        $inherited = $ancestors === [] ? [] : $this->grantsFor($ancestors);

        $states = $this->resolver->resolveAll($direct, $inherited);

        return [
            'role' => $this->roleHeader($role, $ancestors),
            'tree' => $this->tree(null, $states),
            'summary' => $this->summary($states),
            'inheritance' => $this->inheritanceChain($ancestors),
            'permissionCodes' => PermissionRegistry::permissionCodes(),
            'generatedAt' => now()->toIso8601String(),
        ];
    }

    /** Flat node list, for exports and for the API-permission view. */
    public function flatten(Role $role): array
    {
        $matrix = $this->build($role);
        $rows = [];

        $walk = function (array $nodes) use (&$walk, &$rows) {
            foreach ($nodes as $node) {
                $rows[] = $node;
                $walk($node['children']);
            }
        };

        $walk($matrix['tree']);

        return $rows;
    }

    private function roleHeader(Role $role, array $ancestors): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'code' => $role->code,
            'roleType' => $role->role_type,
            'isSystem' => (bool) $role->is_system,
            'isSensitive' => (bool) $role->is_sensitive,
            'status' => $role->status,
            'version' => (int) ($role->version ?? 1),
            'parentRoleIds' => $ancestors,
            'assignedUserCount' => $this->assignedUserCount($role->id),
        ];
    }

    /**
     * How many people a change to this role actually reaches.
     *
     * Counted across both assignment records, de-duplicated by user. This used
     * to read authorization_role_assignments alone and fall back to user_roles
     * only when that table was absent — but User::roles() is a belongsToMany on
     * user_roles, so user_roles is what every permission check actually
     * resolves. The two disagree in this database: the super administrator has
     * a user_roles row and no active enterprise assignment, so the screen
     * reported "Assigned Users: 0" for a role somebody holds.
     *
     * Reporting a number that is not the set of affected people is worse than
     * reporting none, because it is the figure an administrator weighs before
     * changing access.
     */
    private function assignedUserCount(int $roleId): int
    {
        $userIds = DB::table('user_roles')->where('role_id', $roleId)->pluck('user_id');

        if (SchemaSupport::hasTable('authorization_role_assignments')) {
            $enterprise = DB::table('authorization_role_assignments')
                ->where('role_id', $roleId)
                ->where('status', 'ACTIVE')
                ->pluck('user_id');

            $userIds = $userIds->concat($enterprise);
        }

        return $userIds->filter()->unique()->count();
    }

    private function tree(?string $parent, array $states): array
    {
        $out = [];

        foreach (PermissionRegistry::childrenOf($parent) as $key => $node) {
            $children = $this->tree($key, $states);
            $state = $states[$key] ?? null;

            $out[] = [
                'key' => $key,
                'permissionCode' => $node['permission'],
                'label' => $node['label'],
                'description' => $node['description'],
                'type' => $node['type'],
                'parentKey' => $node['parent'],
                'route' => $node['route'],
                'sensitivity' => $node['sensitivity'],
                'assignable' => $node['assignable'],
                'deprecated' => $node['deprecated'],
                'scopes' => $node['scopes'],
                'impliedCodes' => $node['implies'],
                'api' => array_map(
                    fn ($entry) => ['method' => $entry[0], 'path' => $entry[1]],
                    $node['api']
                ),
                'requiredCodes' => PermissionRegistry::requiredCodesFor($key),
                'configuredState' => $state['configuredState'] ?? EffectiveStateResolver::NOT_ASSIGNED,
                'effectiveResult' => $state['effectiveResult'] ?? EffectiveStateResolver::DENY,
                'source' => $state['source'] ?? EffectiveStateResolver::SOURCE_DEFAULT,
                'reason' => $state['reason'] ?? EffectiveStateResolver::REASON_DEFAULT_DENY,
                'inheritedFromRoleId' => $state['inheritedFromRoleId'] ?? null,
                'conditionCount' => $state['conditionCount'] ?? 0,
                'blockedBy' => $state['blockedBy'] ?? null,
                'displayOrder' => $node['order'],
                'children' => $children,
            ];
        }

        return $out;
    }

    /**
     * Counts for the Role Summary card.
     *
     * Configured buckets and effective buckets are counted separately because
     * they answer different questions: how much has been configured, and how much
     * access actually results. Only assignable nodes are counted — grouping rows
     * would otherwise inflate the total with rows nobody can grant.
     */
    private function summary(array $states): array
    {
        $counts = [
            'total' => 0,
            'allow' => 0, 'deny' => 0, 'conditional' => 0, 'notAssigned' => 0,
            'inheritedAllow' => 0, 'inheritedDeny' => 0,
            'effectiveAllow' => 0, 'effectiveDeny' => 0, 'effectiveConditional' => 0,
            'directAllow' => 0, 'directDeny' => 0,
            'sensitiveAllowed' => 0, 'criticalAllowed' => 0,
            'suppressedByParent' => 0,
        ];

        foreach (PermissionRegistry::all() as $key => $node) {
            if ($node['permission'] === null) {
                continue;
            }

            $state = $states[$key] ?? null;

            if ($state === null) {
                continue;
            }

            $counts['total']++;

            $inherited = $state['source'] === EffectiveStateResolver::SOURCE_INHERITED;

            match ($state['configuredState']) {
                EffectiveStateResolver::ALLOW => $counts['allow']++,
                EffectiveStateResolver::DENY => $counts['deny']++,
                EffectiveStateResolver::CONDITIONAL => $counts['conditional']++,
                default => $counts['notAssigned']++,
            };

            if ($inherited && $state['effectiveResult'] === EffectiveStateResolver::DENY) {
                $counts['inheritedDeny']++;
            } elseif ($inherited) {
                $counts['inheritedAllow']++;
            }

            if ($state['source'] === EffectiveStateResolver::SOURCE_DIRECT) {
                $state['effectiveResult'] === EffectiveStateResolver::DENY
                    ? $counts['directDeny']++
                    : $counts['directAllow']++;
            }

            match ($state['effectiveResult']) {
                EffectiveStateResolver::ALLOW => $counts['effectiveAllow']++,
                EffectiveStateResolver::CONDITIONAL => $counts['effectiveConditional']++,
                default => $counts['effectiveDeny']++,
            };

            if ($state['blockedBy'] !== null
                && $state['configuredState'] !== EffectiveStateResolver::NOT_ASSIGNED
                && $state['configuredState'] !== EffectiveStateResolver::DENY) {
                $counts['suppressedByParent']++;
            }

            if ($state['effectiveResult'] === EffectiveStateResolver::ALLOW) {
                if ($node['sensitivity'] !== PermissionRegistry::SENSITIVITY_NORMAL) {
                    $counts['sensitiveAllowed']++;
                }
                if ($node['sensitivity'] === PermissionRegistry::SENSITIVITY_CRITICAL) {
                    $counts['criticalAllowed']++;
                }
            }
        }

        return $counts;
    }

    /**
     * Ancestor role ids, nearest first.
     *
     * Cycles cannot be created through the API, but a cycle already in the
     * database would loop here, so visited ids are tracked and depth is capped.
     */
    public function ancestors(int $roleId): array
    {
        if (! SchemaSupport::hasTable('authorization_role_inheritances')) {
            return [];
        }

        $ancestors = [];
        $frontier = [$roleId];
        $seen = [$roleId => true];

        for ($depth = 0; $depth < self::MAX_DEPTH && $frontier !== []; $depth++) {
            $parents = DB::table('authorization_role_inheritances')
                ->whereIn('child_role_id', $frontier)
                ->pluck('parent_role_id')
                ->all();

            $frontier = [];

            foreach ($parents as $parent) {
                if (isset($seen[$parent])) {
                    continue;
                }
                $seen[$parent] = true;
                $ancestors[] = (int) $parent;
                $frontier[] = $parent;
            }
        }

        return $ancestors;
    }

    /** Parent roles for the Inheritance Tree card, protected identities excluded. */
    private function inheritanceChain(array $ancestors): array
    {
        if ($ancestors === []) {
            return [];
        }

        return \App\Support\SystemRoles::exclude(
            Role::query()->whereIn('id', $ancestors)
        )->get(['id', 'name', 'code', 'role_type'])
            ->map(fn (Role $role) => [
                'id' => $role->id,
                'name' => $role->name,
                'code' => $role->code,
                'roleType' => $role->role_type,
            ])->values()->all();
    }

    /**
     * Grants held by the given roles, keyed by canonical permission code.
     *
     * A deny anywhere in the set wins, so a permission denied by one ancestor
     * cannot be resurrected by another that allows it.
     *
     * @param  list<int>  $roleIds
     */
    private function grantsFor(array $roleIds): array
    {
        if ($roleIds === []) {
            return [];
        }

        $columns = ['p.code as code', 'rp.role_id'];

        foreach (SchemaSupport::present('role_permissions', ['effect', 'conditions']) as $column) {
            $columns[] = 'rp.' . $column;
        }

        $rows = DB::table('role_permissions as rp')
            ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
            ->whereIn('rp.role_id', $roleIds)
            ->get($columns);

        $grants = [];

        foreach ($rows as $row) {
            $code = (string) $row->code;
            $effect = strtoupper($row->effect ?? 'ALLOW');

            if (($grants[$code]['effect'] ?? null) === 'DENY') {
                continue;
            }

            $grants[$code] = [
                'effect' => $effect,
                'conditions' => isset($row->conditions) ? $this->conditionCount($row->conditions) : 0,
                'roleId' => (int) $row->role_id,
            ];
        }

        return $grants;
    }

    private function conditionCount(mixed $conditions): int
    {
        if (is_string($conditions)) {
            $conditions = json_decode($conditions, true);
        }

        if (! is_array($conditions)) {
            return 0;
        }

        return count($conditions['all'] ?? $conditions['any'] ?? $conditions);
    }
}
