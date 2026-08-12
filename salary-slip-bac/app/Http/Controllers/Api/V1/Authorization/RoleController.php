<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Http\Requests\Authorization\StoreRoleRequest;
use App\Http\Requests\Authorization\UpdateRoleRequest;
use App\Services\Authorization\RoleManagementService;
use App\Support\ProtectedRoles;
use App\Support\RoleHierarchy;
use App\Support\RoleAudit;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Metadata and lifecycle management for roles, behind Access Control > Roles.
 *
 * Permission-to-role editing belongs to the Permission Matrix; this
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
        $actor = auth('api')->user();
        $payload = $request->payload();

        // A reserved code carries a tier by definition — creating one would
        // manufacture an Admin or the internal identity out of a plain create
        // request. Uniqueness does not cover this: it only blocks a duplicate,
        // so a code absent from this deployment would otherwise be mintable.
        if (RoleHierarchy::isReservedCode($payload['code'] ?? null)
            || RoleHierarchy::isReservedCode($payload['name'] ?? null)) {
            RoleAudit::denied(request(), $actor, 'ROLE_CLASS_CREATION_FORBIDDEN');

            return response()->json([
                'success' => false,
                'code' => 'ROLE_CLASS_CREATION_FORBIDDEN',
                'message' => 'You do not have permission to create this type of role.',
            ], 403);
        }

        // Everything a client can create is CUSTOM: the tier is decided by the
        // code, and reserved codes were just refused. The check is kept explicit
        // so raising an actor's creatable set does not silently widen this.
        if (!RoleHierarchy::canCreateRoleClass($actor, RoleHierarchy::CUSTOM)) {
            RoleAudit::denied(request(), $actor, 'ROLE_CLASS_CREATION_FORBIDDEN');

            return response()->json([
                'success' => false,
                'code' => 'ROLE_CLASS_CREATION_FORBIDDEN',
                'message' => 'You do not have permission to create this type of role.',
            ], 403);
        }

        // Tenant is resolved from the authenticated identity, never accepted
        // from the browser, so a forged tenantId cannot place a role in someone
        // else's tenant.
        unset($payload['tenantId']);

        $role = $this->roles->create($payload);

        return response()->json(['success' => true, 'data' => $this->roles->present($role)], 201);
    }

    public function update(UpdateRoleRequest $request, int $role): JsonResponse
    {
        $model = $this->roles->find($role);

        if ($model === null) {
            return $this->notFound();
        }

        if ($denied = $this->denyUnlessManageable($model, 'update')) {
            return $denied;
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

        if ($denied = $this->denyUnlessManageable($model, 'delete')) {
            return $denied;
        }

        // Protection is checked by CODE first, not only by the is_system flag.
        // is_system is a mutable column: an UPDATE that clears it would strip
        // the super administrator of protection while leaving it fully
        // privileged. The code cannot be edited into a role that lacks it.
        if (ProtectedRoles::isProtected($model)) {
            RoleAudit::denied(request(), auth('api')->user(), 'ROLE_PROTECTED', $model);

            return $this->conflict('This role is protected and cannot be deleted.', 'ROLE_PROTECTED');
        }

        // is_system blocks the Admin tier for an administrator, not for the
        // super administrator. The super administrator owns every visible tier
        // including Admin and Security Administrator, so a system flag is not a
        // reason to refuse them. The protected code check above still stands and
        // is what keeps the internal identity undeletable by anyone.
        if ($model->is_system && ! auth('api')->user()?->isSuperAdmin()) {
            return $this->conflict('System roles cannot be deleted.', 'ROLE_IS_SYSTEM');
        }

        /*
         * A held role is refused unless a super administrator says otherwise.
         *
         * The block exists because deleting a role silently strips whoever holds
         * it, and on a database whose foreign keys refuse instead of cascading
         * the request dies as a 500 with no explanation. Neither is acceptable
         * as a default.
         *
         * A super administrator may still proceed with ?force=1 — a deliberate,
         * separate act rather than the ordinary delete. The assignments are then
         * removed inside the same transaction as the role, so no holder is left
         * pointing at a row that no longer exists.
         */
        $assigned = $this->roles->assignedUserCount($model);
        $actor = auth('api')->user();
        $forced = request()->boolean('force') && $actor?->isSuperAdmin();

        if ($assigned > 0 && ! $forced) {
            return response()->json([
                'success' => false,
                'code' => 'ROLE_HAS_ASSIGNED_USERS',
                'message' => 'This role is assigned to users. Reassign those users before deleting the role.',
                'assignedUserCount' => $assigned,
                'forcible' => (bool) $actor?->isSuperAdmin(),
            ], 409);
        }

        if ($forced && $assigned > 0) {
            RoleAudit::denied(request(), $actor, 'ROLE_FORCE_DELETED_WITH_HOLDERS', $model);
        }

        try {
            $this->roles->delete($model, $forced);
        } catch (QueryException $e) {
            report($e);

            // A foreign-key constraint violation means a table we do not yet
            // clean up in RoleManagementService::delete() still holds a row
            // that points at this role. Return a structured JSON 409 so the
            // client receives a parseable response instead of an HTML 500 page.
            if (in_array($e->getCode(), ['23000', '23503', '1451', '1452'], true)) {
                return $this->conflict(
                    'This role cannot be deleted because it is still referenced by other records. Contact your administrator.',
                    'ROLE_HAS_REFERENCES'
                );
            }

            return response()->json([
                'success' => false,
                'code'    => 'DELETE_FAILED',
                'message' => 'An unexpected error occurred while deleting the role. Please try again.',
            ], 500);
        }

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

        if ($denied = $this->denyUnlessManageable($model, $status)) {
            return $denied;
        }

        // Deactivating or archiving the super administrator locks every
        // administrator out of role management permanently, since this surface
        // is the only way back in. Refused for everyone, the acting super
        // administrator included.
        if (ProtectedRoles::isProtected($model)) {
            RoleAudit::denied(request(), auth('api')->user(), 'ROLE_PROTECTED', $model);

            return $this->conflict('This role is protected and cannot change status.', 'ROLE_PROTECTED');
        }

        if ($model->is_system && ! auth('api')->user()?->isSuperAdmin()) {
            return $this->conflict('System roles cannot change status.', 'ROLE_IS_SYSTEM');
        }

        $updated = $this->roles->setStatus($model, $status, $isActive);

        return response()->json(['success' => true, 'data' => $this->roles->present($updated)]);
    }


    /**
     * Per-target authorisation. The middleware only established that the caller
     * may manage *something*; this decides whether they may manage *this*.
     *
     * 403 rather than 404 here: the target is a role the caller can already see
     * in the list, so its existence is not a secret. The hidden internal
     * identity never reaches this method — find() conceals it and answers 404.
     */
    private function denyUnlessManageable(Role $target, string $operation): ?JsonResponse
    {
        $actor = auth('api')->user();

        if (RoleHierarchy::canManage($actor, $target)) {
            return null;
        }

        RoleAudit::denied(request(), $actor, 'ROLE_MANAGEMENT_FORBIDDEN', $target);

        return response()->json([
            'success' => false,
            'code' => 'ROLE_MANAGEMENT_FORBIDDEN',
            'message' => 'You do not have permission to manage this role.',
        ], 403);
    }

    private function notFound(): JsonResponse
    {
        return response()->json([
            'success' => false,
            'error' => ['code' => 'NOT_FOUND', 'message' => 'Role not found.'],
        ], 404);
    }

    private function conflict(string $message, string $code = 'CONFLICT'): JsonResponse
    {
        return response()->json([
            'success' => false,
            'code' => $code,
            'message' => $message,
            'error' => ['code' => $code, 'message' => $message],
        ], 409);
    }
}
