<?php

namespace App\Services\Authorization;

use App\Models\Role;
use Illuminate\Support\Facades\DB;

/**
 * Builds the Permission Matrix for one role: the grid of resources x actions,
 * each cell carrying the state that role has for that permission.
 *
 * The matrix is a *configuration* view, not a decision. It answers "what does
 * this role grant?", which is a question about role_permissions and role
 * inheritance only. It deliberately does not run AuthorizationEngine::decide():
 * a decision needs a subject, a resource and an environment, and inventing
 * those to colour a grid would show an administrator a state that no real
 * request would produce. Effective access for an actual user is a separate
 * question, answered by the effective-permissions endpoint.
 *
 * Cell states, in the order they win:
 *
 *   DENY / INHERITED_DENY   an explicit deny anywhere in the chain
 *   ALLOW / INHERITED_ALLOW an explicit allow
 *   CONDITIONAL             an allow that carries conditions
 *   NOT_ASSIGNED            nothing grants it
 *
 * Deny beats allow at every level, and a nearer role beats a more distant
 * ancestor only when both are allows — a deny inherited from a parent is not
 * silently overridden by a child's allow, because that is how an administrator
 * revokes something centrally.
 */
class PermissionMatrixBuilder
{
    /** Maximum inheritance depth, matching authorization_role_inheritances.max_depth. */
    private const MAX_DEPTH = 8;

    public function build(Role $role): array
    {
        $ancestors = $this->ancestors($role->id);
        $direct = $this->grantsFor([$role->id]);
        $inherited = $ancestors ? $this->grantsFor($ancestors) : [];

        $actions = DB::table('authorization_actions')
            ->where('is_active', true)
            ->orderBy('display_order')
            ->get(['id', 'code', 'name', 'category', 'is_primary_column', 'is_sensitive']);

        $modules = DB::table('authorization_modules')
            ->where('is_active', true)
            ->orderBy('display_order')
            ->get(['id', 'code', 'name', 'description']);

        $resources = DB::table('authorization_resources')
            ->where('is_active', true)
            ->orderBy('display_order')
            ->get(['id', 'code', 'name', 'module_id', 'parent_id', 'resource_type', 'is_sensitive']);

        // Which cells exist at all. A resource/action pair with no permission
        // behind it is not rendered as an editable cell.
        $cells = DB::table('authorization_resource_actions as ra')
            ->join('permissions as p', 'p.id', '=', 'ra.permission_id')
            ->get(['ra.resource_id', 'ra.action_id', 'ra.is_sensitive', 'p.id as permission_id', 'p.name as permission_code']);

        $cellsByResource = [];
        foreach ($cells as $cell) {
            $cellsByResource[$cell->resource_id][$cell->action_id] = $cell;
        }

        $actionCodeById = $actions->pluck('code', 'id')->all();
        $resourceCodeById = $resources->pluck('code', 'id')->all();

        $summary = [
            'total' => 0, 'allow' => 0, 'deny' => 0, 'conditional' => 0,
            'notAssigned' => 0, 'inheritedAllow' => 0, 'inheritedDeny' => 0,
            'sensitive' => 0,
        ];

        $byModule = [];
        foreach ($resources as $resource) {
            $resourceCells = $cellsByResource[$resource->id] ?? [];
            if (!$resourceCells) {
                continue;
            }

            $rendered = [];
            foreach ($resourceCells as $actionId => $cell) {
                $state = $this->stateFor($cell->permission_code, $direct, $inherited);

                $summary['total']++;
                $summary[match ($state['state']) {
                    'ALLOW' => 'allow',
                    'DENY' => 'deny',
                    'CONDITIONAL' => 'conditional',
                    'INHERITED_ALLOW' => 'inheritedAllow',
                    'INHERITED_DENY' => 'inheritedDeny',
                    default => 'notAssigned',
                }]++;
                if ($cell->is_sensitive) {
                    $summary['sensitive']++;
                }

                $rendered[$actionCodeById[$actionId]] = array_merge($state, [
                    'permissionId' => $cell->permission_id,
                    'permissionCode' => $cell->permission_code,
                    'isSensitive' => (bool) $cell->is_sensitive,
                ]);
            }

            $byModule[$resource->module_id][] = [
                'code' => $resource->code,
                'name' => $resource->name,
                'resourceType' => $resource->resource_type,
                'isSensitive' => (bool) $resource->is_sensitive,
                'parentCode' => $resource->parent_id ? ($resourceCodeById[$resource->parent_id] ?? null) : null,
                'cells' => $rendered,
            ];
        }

        return [
            'role' => [
                'id' => $role->id,
                'name' => $role->name,
                'code' => $role->code,
                'roleType' => $role->role_type,
                'isSystem' => (bool) $role->is_system,
                'isSensitive' => (bool) $role->is_sensitive,
                'status' => $role->status,
                'version' => $role->version,
                'parentRoleIds' => $ancestors,
            ],
            'actions' => $actions->map(fn ($a) => [
                'code' => $a->code,
                'name' => $a->name,
                'category' => $a->category,
                'isPrimaryColumn' => (bool) $a->is_primary_column,
                'isSensitive' => (bool) $a->is_sensitive,
            ])->values()->all(),
            'modules' => $modules
                ->filter(fn ($m) => !empty($byModule[$m->id]))
                ->map(fn ($m) => [
                    'code' => $m->code,
                    'name' => $m->name,
                    'description' => $m->description,
                    'resources' => $byModule[$m->id],
                ])->values()->all(),
            'summary' => $summary,
        ];
    }

    /**
     * Ancestor role ids, nearest first. Cycles are impossible to create through
     * the API, but a cycle already in the database would otherwise loop here, so
     * visited ids are tracked and depth is capped.
     *
     * @return list<int>
     */
    public function ancestors(int $roleId): array
    {
        if (!SchemaSupport::hasTable('authorization_role_inheritances')) {
            return [];
        }

        $ancestors = [];
        $frontier = [$roleId];
        $seen = [$roleId => true];

        for ($depth = 0; $depth < self::MAX_DEPTH && $frontier; $depth++) {
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

    /**
     * Grants held by the given roles, keyed by permission code.
     *
     * A deny anywhere in the set wins, so a permission denied by one ancestor
     * cannot be resurrected by another that allows it.
     *
     * @param  list<int>  $roleIds
     * @return array<string,array{effect:string,conditions:int,roleId:int}>
     */
    private function grantsFor(array $roleIds): array
    {
        if (!$roleIds) {
            return [];
        }

        $columns = ['p.name as code', 'rp.role_id'];
        foreach (SchemaSupport::present('role_permissions', ['effect', 'conditions']) as $column) {
            $columns[] = 'rp.' . $column;
        }

        $rows = DB::table('role_permissions as rp')
            ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
            ->whereIn('rp.role_id', $roleIds)
            ->get($columns);

        $grants = [];
        foreach ($rows as $row) {
            $effect = strtoupper($row->effect ?? 'ALLOW');
            $conditions = isset($row->conditions) ? $this->conditionCount($row->conditions) : 0;

            $existing = $grants[$row->code] ?? null;
            if ($existing && $existing['effect'] === 'DENY') {
                continue; // A deny already recorded cannot be downgraded.
            }

            $grants[$row->code] = [
                'effect' => $effect,
                'conditions' => $conditions,
                'roleId' => (int) $row->role_id,
            ];
        }

        return $grants;
    }

    /** @return array{state:string,source:?string,inheritedFromRoleId:?int,conditionCount:int} */
    private function stateFor(string $code, array $direct, array $inherited): array
    {
        $own = $direct[$code] ?? null;
        $up = $inherited[$code] ?? null;

        // Deny wins wherever it comes from, and an inherited deny is reported as
        // inherited so the administrator can see it is not theirs to clear here.
        if ($own && $own['effect'] === 'DENY') {
            return $this->cell('DENY', 'DIRECT', null, $own['conditions']);
        }
        if ($up && $up['effect'] === 'DENY') {
            return $this->cell('INHERITED_DENY', 'INHERITED', $up['roleId'], $up['conditions']);
        }
        if ($own) {
            return $own['conditions'] > 0
                ? $this->cell('CONDITIONAL', 'DIRECT', null, $own['conditions'])
                : $this->cell('ALLOW', 'DIRECT', null, 0);
        }
        if ($up) {
            return $up['conditions'] > 0
                ? $this->cell('CONDITIONAL', 'INHERITED', $up['roleId'], $up['conditions'])
                : $this->cell('INHERITED_ALLOW', 'INHERITED', $up['roleId'], 0);
        }

        return $this->cell('NOT_ASSIGNED', null, null, 0);
    }

    private function cell(string $state, ?string $source, ?int $from, int $conditions): array
    {
        return [
            'state' => $state,
            'source' => $source,
            'inheritedFromRoleId' => $from,
            'conditionCount' => $conditions,
        ];
    }

    private function conditionCount(mixed $conditions): int
    {
        if (is_string($conditions)) {
            $conditions = json_decode($conditions, true);
        }
        if (!is_array($conditions)) {
            return 0;
        }

        return count($conditions['all'] ?? $conditions['any'] ?? $conditions);
    }
}
