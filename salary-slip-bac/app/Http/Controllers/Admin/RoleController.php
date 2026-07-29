<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Permission;
use App\Models\PermissionGroup;
use App\Models\Role;
use App\Support\AuditLogger;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    public function index(Request $request)
    {
        $roles = Role::withCount(['permissions', 'users'])
            ->orderBy('name')
            ->get();

        return response()->json(['status' => true, 'data' => $roles]);
    }

    public function show($id)
    {
        $role = Role::with(['permissions.group', 'users:id,name,email'])->find($id);

        if (!$role) {
            return response()->json(['status' => false, 'message' => 'Role not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $role]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string|unique:roles,name',
            'permission_ids' => 'array',
            'permission_ids.*' => 'integer|exists:permissions,id',
        ]);

        $role = Role::create([
            'name' => $request->name,
            'type' => 'Custom',
            'is_active' => true,
        ]);

        if ($request->filled('permission_ids')) {
            $role->permissions()->sync($request->permission_ids);
        }

        AuditLogger::log($request, 'CREATE', 'Roles', null, $role->toArray());

        return response()->json([
            'status' => true,
            'message' => 'Role created',
            'data' => $role->load('permissions'),
        ]);
    }

    public function update(Request $request, $id)
    {
        $role = Role::find($id);
        if (!$role) {
            return response()->json(['status' => false, 'message' => 'Role not found'], 404);
        }

        $request->validate([
            'name' => 'required|string|unique:roles,name,' . $role->id,
            'permission_ids' => 'array',
            'permission_ids.*' => 'integer|exists:permissions,id',
        ]);

        if ($role->type === 'System' && $request->name !== $role->name) {
            return response()->json(['status' => false, 'message' => 'Cannot rename a system role'], 403);
        }

        $before = $role->toArray();
        $role->name = $request->name;
        $role->save();

        if ($request->has('permission_ids')) {
            $role->permissions()->sync($request->permission_ids ?? []);
        }

        AuditLogger::log($request, 'UPDATE', 'Roles', $before, $role->fresh()->toArray());

        return response()->json([
            'status' => true,
            'message' => 'Role updated',
            'data' => $role->load('permissions'),
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $role = Role::withCount('users')->find($id);
        if (!$role) {
            return response()->json(['status' => false, 'message' => 'Role not found'], 404);
        }

        if ($role->type === 'System') {
            return response()->json(['status' => false, 'message' => 'Cannot delete a system role'], 403);
        }

        if ($role->users_count > 0) {
            return response()->json(['status' => false, 'message' => 'Cannot delete a role that is still assigned to users'], 409);
        }

        $before = $role->toArray();
        $role->delete();

        AuditLogger::log($request, 'DELETE', 'Roles', $before, null);

        return response()->json(['status' => true, 'message' => 'Role deleted']);
    }

    public function permissions(Request $request)
    {
        $groups = PermissionGroup::with('permissions')->orderBy('name')->get();

        return response()->json(['status' => true, 'data' => $groups]);
    }

    /**
     * Excel-style matrix data: every role, alongside just the permission IDs
     * it has (not the full nested objects index()/show() return) so the grid
     * can render a plain roleId -> Set(permissionId) lookup.
     */
    public function matrix(Request $request)
    {
        $roles = Role::with('permissions:id')->orderBy('name')->get(['id', 'name', 'type']);

        $data = $roles->map(fn($role) => [
            'id' => $role->id,
            'name' => $role->name,
            'type' => $role->type,
            'permission_ids' => $role->permissions->pluck('id'),
        ]);

        return response()->json(['status' => true, 'data' => $data]);
    }

    public function updateMatrix(Request $request)
    {
        $request->validate([
            'role_id' => 'required|integer|exists:roles,id',
            'permission_ids' => 'array',
            'permission_ids.*' => 'integer|exists:permissions,id',
        ]);

        $role = Role::find($request->role_id);
        $before = $role->permissions()->pluck('permissions.id');

        $role->permissions()->sync($request->permission_ids ?? []);

        AuditLogger::log($request, 'UPDATE', 'Permission Matrix', ['role_id' => $role->id, 'permission_ids' => $before], ['role_id' => $role->id, 'permission_ids' => $request->permission_ids ?? []]);

        return response()->json(['status' => true, 'message' => 'Permission matrix updated']);
    }
}
