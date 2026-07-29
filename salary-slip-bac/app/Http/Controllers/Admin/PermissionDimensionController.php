<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\PermissionDimension;
use App\Models\Role;
use App\Support\AuditLogger;
use Illuminate\Http\Request;

/**
 * Backs the Menu/Page/Module/Action/Row/Field permission screens and the
 * Location/Warehouse/Branch access screens. They're all structurally the
 * same thing — "for this role, this key gets this value" — scoped by
 * $dimension, e.g. /rbac/permission-dimensions/page.
 */
class PermissionDimensionController extends Controller
{
    private const DIMENSIONS = [
        'menu', 'page', 'module', 'action', 'row', 'field',
        'location', 'warehouse', 'branch',
    ];

    public function index(Request $request, string $dimension)
    {
        $this->assertValidDimension($dimension);

        $items = PermissionDimension::with('role:id,name')
            ->where('dimension', $dimension)
            ->when($request->query('role_id'), fn($q, $roleId) => $q->where('role_id', $roleId))
            ->orderBy('key_name')
            ->get();

        return response()->json(['status' => true, 'data' => $items]);
    }

    public function store(Request $request, string $dimension)
    {
        $this->assertValidDimension($dimension);

        $data = $request->validate([
            'role_id' => 'required|integer|exists:roles,id',
            'key_name' => 'required|string',
            'value' => 'required|string',
            'meta' => 'nullable|array',
        ]);
        $data['dimension'] = $dimension;

        $item = PermissionDimension::updateOrCreate(
            ['dimension' => $dimension, 'role_id' => $data['role_id'], 'key_name' => $data['key_name']],
            ['value' => $data['value'], 'meta' => $data['meta'] ?? null]
        );

        AuditLogger::log($request, 'ASSIGN', ucfirst($dimension) . ' Permissions', null, $item->toArray());

        return response()->json(['status' => true, 'message' => ucfirst($dimension) . ' permission saved', 'data' => $item->load('role:id,name')]);
    }

    public function destroy(Request $request, string $dimension, $id)
    {
        $this->assertValidDimension($dimension);

        $item = PermissionDimension::where('dimension', $dimension)->find($id);
        if (!$item) {
            return response()->json(['status' => false, 'message' => 'Not found'], 404);
        }

        $before = $item->toArray();
        $item->delete();

        AuditLogger::log($request, 'REVOKE', ucfirst($dimension) . ' Permissions', $before, null);

        return response()->json(['status' => true, 'message' => 'Removed']);
    }

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

    public function roles()
    {
        return response()->json(['status' => true, 'data' => Role::orderBy('name')->get(['id', 'name', 'type'])]);
    }

    private function assertValidDimension(string $dimension): void
    {
        abort_unless(in_array($dimension, self::DIMENSIONS, true), 404, 'Unknown permission dimension');
    }
}
