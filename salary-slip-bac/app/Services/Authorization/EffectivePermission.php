<?php

namespace App\Services\Authorization;

use App\Models\User;
use App\Support\PermissionRegistry;
use Illuminate\Support\Facades\DB;

class EffectivePermission
{
    /**
     * Does this actor effectively hold the registry node?
     *
     * A child is only effective when every ancestor that carries a permission
     * is also held. Storing a true child under a false parent is allowed and
     * preserved — it simply has no effect until the parent is restored.
     */
    public function allows(?User $actor, string $nodeKey): bool
    {
        if ($actor === null) {
            return false;
        }

        if ($actor->isSuperAdmin()) {
            return true;
        }

        if (! PermissionRegistry::has($nodeKey)) {
            return false;
        }

        $required = PermissionRegistry::requiredCodesFor($nodeKey);

        if ($required === []) {
            return false;
        }

        $held = $this->heldCodes($actor);

        foreach ($required as $code) {
            if (! isset($held[$code])) {
                return false;
            }
        }

        return true;
    }

    /** Registry nodes this actor effectively holds. */
    public function allowedNodes(?User $actor): array
    {
        if ($actor === null) {
            return [];
        }

        $out = [];

        foreach (array_keys(PermissionRegistry::all()) as $key) {
            if ($this->allows($actor, $key)) {
                $out[] = $key;
            }
        }

        return $out;
    }

    /**
     * Columns of a page the actor may see.
     *
     * Used by serializers so a restricted column is absent from the payload
     * rather than rendered and hidden by the browser.
     */
    public function visibleColumns(?User $actor, string $columnsNodeKey): array
    {
        $out = [];

        foreach (PermissionRegistry::childrenOf($columnsNodeKey) as $key => $node) {
            if ($node['type'] === PermissionRegistry::TYPE_COLUMN && $this->allows($actor, $key)) {
                $out[] = $key;
            }
        }

        return $out;
    }

    /** ALLOW-effect permission codes from every role the user holds. */
    private function heldCodes(User $actor): array
    {
        $codes = [];

        try {
            $roleIds = $actor->roles()->pluck('roles.id');

            if ($roleIds->isEmpty()) {
                return [];
            }

            $rows = DB::table('role_permissions')
                ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
                ->whereIn('role_permissions.role_id', $roleIds)
                ->where('role_permissions.effect', 'ALLOW')
                ->pluck('permissions.code');

            foreach ($rows as $code) {
                $codes[(string) $code] = true;
            }
        } catch (\Throwable) {
            return [];
        }

        return $codes;
    }
}
