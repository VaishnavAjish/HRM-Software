<?php

namespace App\Services\Authorization;

use App\Models\Role;
use App\Support\PermissionRegistry;
use Illuminate\Support\Facades\DB;

class PermissionTreeBuilder
{
    public const STATE_ENABLED = 'enabled';
    public const STATE_DISABLED = 'disabled';
    public const STATE_NOT_APPLICABLE = 'not_applicable';

    public const PARENT_CHECKED = 'checked';
    public const PARENT_UNCHECKED = 'unchecked';
    public const PARENT_INDETERMINATE = 'indeterminate';
    public const PARENT_NOT_APPLICABLE = 'not_applicable';

    public function build(Role $role): array
    {
        $granted = $this->grantedCodes($role);

        return $this->nodes(null, $granted);
    }

    public function summary(Role $role): array
    {
        $granted = $this->grantedCodes($role);

        $enabled = 0;
        $disabled = 0;
        $notApplicable = 0;

        foreach (PermissionRegistry::all() as $node) {
            $code = $node['permission'] ?? null;

            if ($code === null) {
                $notApplicable++;
                continue;
            }

            isset($granted[$code]) ? $enabled++ : $disabled++;
        }

        return [
            'enabled' => $enabled,
            'disabled' => $disabled,
            'notApplicable' => $notApplicable,
            'totalApplicable' => $enabled + $disabled,
        ];
    }

    private function nodes(?string $parent, array $granted): array
    {
        $out = [];

        foreach (PermissionRegistry::childrenOf($parent) as $key => $node) {
            $children = $this->nodes($key, $granted);
            $code = $node['permission'] ?? null;

            $out[] = [
                'key' => $key,
                'label' => $node['label'],
                'type' => $node['type'],
                'permissionKey' => $code,
                'assignable' => $code !== null,
                'sensitive' => (bool) ($node['sensitive'] ?? false),
                'route' => $node['route'] ?? null,
                'displayOrder' => $node['order'] ?? 0,
                'parentKey' => $node['parent'] ?? null,
                'requiredCodes' => PermissionRegistry::requiredCodesFor($key),
                'state' => $this->stateOf($code, $granted),
                'aggregateState' => $this->aggregateOf($key, $granted),
                'children' => $children,
            ];
        }

        return $out;
    }

    private function stateOf(?string $code, array $granted): string
    {
        if ($code === null) {
            return self::STATE_NOT_APPLICABLE;
        }

        return isset($granted[$code]) ? self::STATE_ENABLED : self::STATE_DISABLED;
    }

    /**
     * Tri-state across a node's assignable descendants.
     *
     * A leaf reports its own state so the browser never has to decide what a
     * parent means; a node with no assignable descendants is Not Applicable
     * rather than silently unchecked.
     */
    private function aggregateOf(string $key, array $granted): string
    {
        $descendants = PermissionRegistry::assignableDescendantsOf($key);

        if ($descendants === []) {
            $own = PermissionRegistry::node($key)['permission'] ?? null;

            if ($own === null) {
                return self::PARENT_NOT_APPLICABLE;
            }

            return isset($granted[$own]) ? self::PARENT_CHECKED : self::PARENT_UNCHECKED;
        }

        $total = 0;
        $on = 0;

        foreach ($descendants as $descendant) {
            $code = PermissionRegistry::node($descendant)['permission'] ?? null;

            if ($code === null) {
                continue;
            }

            $total++;

            if (isset($granted[$code])) {
                $on++;
            }
        }

        if ($total === 0) {
            return self::PARENT_NOT_APPLICABLE;
        }

        if ($on === 0) {
            return self::PARENT_UNCHECKED;
        }

        return $on === $total ? self::PARENT_CHECKED : self::PARENT_INDETERMINATE;
    }

    private function grantedCodes(Role $role): array
    {
        $codes = [];

        $rows = DB::table('role_permissions')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('role_permissions.role_id', $role->id)
            ->where('role_permissions.effect', 'ALLOW')
            ->pluck('permissions.code');

        foreach ($rows as $code) {
            $codes[(string) $code] = true;
        }

        return $codes;
    }
}
