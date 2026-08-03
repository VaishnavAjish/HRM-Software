<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PermissionDimension;
use App\Models\Role;

/**
 * Reads the signed-in user's own page grants.
 *
 * This class used to back the Menu/Page/Module/Action/Row/Field and
 * Location/Warehouse/Branch permission editors as well — all structurally the
 * same "for this role, this key gets this value" scoped by $dimension. Those
 * editors were part of the Access Control console and have been removed, so
 * only the self-read remains.
 *
 * Grants are still stored and still enforced; there is simply no longer a
 * screen for editing them. They are written directly, or by the seeders.
 */
class PermissionDimensionController extends Controller
{
    /**
     * The page grants for the calling user, read at login by the client.
     *
     * Page permissions are held against a private per-user role row named
     * User_{id}_Permissions rather than a shared named role. No row means no
     * grants recorded, which the client reads as "unrestricted" — the map is
     * permissive by default, so an empty list must not be treated as a denial.
     */
    public function myPermissions()
    {
        $user = auth('api')->user();
        if (!$user) {
            return response()->json(['status' => false, 'message' => 'Unauthenticated'], 401);
        }

        $roleName = "User_" . $user->id . "_Permissions";
        $role = Role::where('name', $roleName)->first();

        if (!$role) {
            return response()->json(['status' => true, 'data' => []]);
        }

        $items = PermissionDimension::where('role_id', $role->id)
            ->where('dimension', 'page')
            ->get();

        return response()->json(['status' => true, 'data' => $items]);
    }
}
