<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Http\Requests\Authorization\StoreRoleRequest;
use App\Http\Requests\Authorization\UpdateRoleRequest;
use App\Services\Authorization\RoleManagementService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Metadata and lifecycle management for roles, behind Access Control > Roles.
 *
 * Permission-to-role editing stays with PermissionMatrixController; this
 * controller owns the role records themselves — create, rename, archive,
 * activate, delete. The one protected SYSTEM_SUPER_ADMIN role is concealed
 * here exactly as a hidden account is on the user directory: it is never
 * listed and every write against it answers 404, so it can be neither seen
 * nor changed through this surface.
 */
class RoleController extends Controller
{
    public function __construct(private readonly RoleManagementService $roles)
    {
    }

    public function summary(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->roles->summary()]);
    }

    public function index(Request $request): JsonResponse
    {
        $result = $this->roles->paginate([
            'search' => $request->string('search')->toString(),
            'status' => $request->string('status')->toString(),
            'type' => $request->string('type')->toString(),
            'roleType' => $request->string('roleType')->toString(),
            'isActive' => $request->input('isActive', ''),
            'perPage' => $request->input('perPage', 25),
            'page' => $request->input('page', 1),
        ]);

        return response()->json(['success' => true] + $result);
    }

    public function show(int $role): JsonResponse
    {
        $model = $this->roles->find($role);

        if ($model === null) {
            return $this->notFound();
        }

        return response()->json(['success' => true, 'data' => $this->roles->present($model)]);
    }

    public function store(StoreRoleRequest $request): JsonResponse
    {
        $role = $this->roles->create($request->payload());

        return response()->json(['success' => true, 'data' => $this->roles->present($role)], 201);
    }

    public function update(UpdateRoleRequest $request, int $role): JsonResponse
    {
        $model = $this->roles->find($role);

        if ($model === null) {
            return $this->notFound();
        }

        $updated = $this->roles->update($model, $request->payload());

        return response()->json(['success' => true, 'data' => $this->roles->present($updated)]);
    }

    public function destroy(int $role): JsonResponse
    {
        $model = $this->roles->find($role);

        if ($model === null) {
            return $this->notFound();
        }

        if ($model->is_system) {
            return $this->conflict('System roles cannot be deleted.');
        }

        $assigned = $this->roles->assignedUserCount($model);
        if ($assigned > 0) {
            return $this->conflict("This role is assigned to {$assigned} user(s). Archive it instead of deleting.");
        }

        $this->roles->delete($model);

        return response()->json(['success' => true, 'data' => ['id' => $role, 'deleted' => true]]);
    }

    public function archive(int $role): JsonResponse
    {
        return $this->transition($role, 'ARCHIVED', false);
    }

    public function restore(int $role): JsonResponse
    {
        return $this->transition($role, 'ACTIVE', true);
    }

    public function activate(int $role): JsonResponse
    {
        return $this->transition($role, 'ACTIVE', true);
    }

    public function deactivate(int $role): JsonResponse
    {
        return $this->transition($role, 'INACTIVE', false);
    }

    private function transition(int $role, string $status, bool $isActive): JsonResponse
    {
        $model = $this->roles->find($role);

        if ($model === null) {
            return $this->notFound();
        }

        if ($model->is_system) {
            return $this->conflict('System roles cannot change status.');
        }

        $updated = $this->roles->setStatus($model, $status, $isActive);

        return response()->json(['success' => true, 'data' => $this->roles->present($updated)]);
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => ['code' => 'NOT_FOUND', 'message' => 'Role not found.'],
        ], 404);
    }

    private function conflict(string $message): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => ['code' => 'CONFLICT', 'message' => $message],
        ], 409);
    }
}
