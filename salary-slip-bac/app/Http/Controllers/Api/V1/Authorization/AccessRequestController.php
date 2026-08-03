<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\AuthorizationAccessRequest;
use App\Models\AuthorizationRoleAssignment;
use App\Models\Permission;
use App\Models\Role;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\SeparationOfDuties;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AccessRequestController extends Controller
{
    public function __construct(private readonly AuthorizationCache $cache, private readonly SeparationOfDuties $sod)
    {
    }

    public function index(Request $request)
    {
        $actor = auth('api')->user();
        $query = AuthorizationAccessRequest::with(['requester:id,name,email', 'targetUser:id,name,email', 'role:id,name,code'])
            ->orderByDesc('created_at');
        if ((int) $actor->role !== 0) {
            $query->where('tenant_id', $actor->company_code);
        }
        if ($request->filled('status')) {
            $query->where('status', $request->query('status'));
        }
        return response()->json(['success' => true, 'data' => $query->paginate(min(100, max(1, (int) $request->query('limit', 25))))]);
    }

    public function store(Request $request)
    {
        $actor = auth('api')->user();
        $data = $request->validate([
            'targetUserId' => ['nullable', 'integer', 'exists:users,id'],
            'roleId' => ['nullable', 'required_without:permissionCode', 'exists:roles,id'],
            'permissionCode' => ['nullable', 'required_without:roleId', 'exists:permissions,code'],
            'scopeType' => ['required', Rule::in(['TENANT','COMPANY','BRANCH','LOCATION','BUSINESS_UNIT','DEPARTMENT','TEAM','SELF','OWN_RECORDS','DIRECT_REPORTS','INDIRECT_REPORTS','ASSIGNED_RECORDS','SHARED_RECORDS','SELECTED_RECORDS'])],
            'scopeId' => ['nullable', 'string', 'max:500'],
            'businessReason' => ['required', 'string', 'min:10', 'max:2000'],
            'requestedUntil' => ['nullable', 'date', 'after:now'],
        ]);
        if (isset($data['targetUserId']) && (int) $data['targetUserId'] !== (int) $actor->id) {
            return response()->json(['success' => false, 'error' => ['code' => 'SELF_REQUEST_ONLY', 'message' => 'Use role assignment administration to request access for another user.']], 403);
        }
        $accessRequest = AuthorizationAccessRequest::create([
            'tenant_id' => $actor->company_code, 'requester_id' => $actor->id,
            'target_user_id' => $data['targetUserId'] ?? $actor->id,
            'role_id' => $data['roleId'] ?? null, 'permission_code' => $data['permissionCode'] ?? null,
            'scope_type' => $data['scopeType'], 'scope_id' => $data['scopeId'] ?? null,
            'business_reason' => $data['businessReason'], 'requested_until' => $data['requestedUntil'] ?? null,
            'status' => 'PENDING',
        ]);
        AuditLogger::log($request, 'REQUEST', 'AuthorizationAccessRequest', null, ['request_id' => $accessRequest->id]);
        return response()->json(['success' => true, 'data' => $accessRequest], 201);
    }

    public function approve(Request $request, AuthorizationAccessRequest $accessRequest)
    {
        $this->guardTenant($accessRequest);
        $data = $request->validate(['decisionReason' => ['required', 'string', 'min:5', 'max:1000']]);
        if ($accessRequest->status !== 'PENDING') {
            return response()->json(['success' => false, 'error' => ['code' => 'ACCESS_REQUEST_ALREADY_DECIDED', 'message' => 'This request has already been decided.']], 409);
        }
        if ($accessRequest->role_id) {
            $role = Role::findOrFail($accessRequest->role_id);
            $conflicts = $this->sod->conflicts($accessRequest->target_user_id, $role, $accessRequest->tenant_id);
            if (collect($conflicts)->contains(fn ($row) => $row['enforcement'] === 'BLOCK')) {
                return response()->json(['success' => false, 'error' => ['code' => 'SOD_CONFLICT', 'message' => 'Approval would violate separation-of-duties rules.', 'conflicts' => $conflicts]], 409);
            }
        }
        DB::transaction(function () use ($accessRequest, $data) {
            if ($accessRequest->role_id) {
                AuthorizationRoleAssignment::create([
                    'user_id' => $accessRequest->target_user_id, 'role_id' => $accessRequest->role_id,
                    'tenant_id' => $accessRequest->tenant_id, 'scope_type' => $accessRequest->scope_type,
                    'scope_id' => $accessRequest->scope_id, 'valid_from' => now(),
                    'valid_until' => $accessRequest->requested_until, 'assignment_source' => 'ACCESS_REQUEST',
                    'assignment_reason' => $accessRequest->business_reason, 'assigned_by' => auth('api')->id(),
                    'approved_by' => auth('api')->id(), 'status' => 'ACTIVE',
                ]);
            } else {
                $permission = Permission::where('code', $accessRequest->permission_code)->firstOrFail();
                DB::table('user_permissions')->updateOrInsert(
                    ['user_id' => $accessRequest->target_user_id, 'permission_id' => $permission->id],
                    ['is_denied' => false, 'valid_from' => now(), 'valid_until' => $accessRequest->requested_until]
                );
            }
            $accessRequest->update([
                'status' => 'APPROVED', 'decided_by' => auth('api')->id(),
                'decision_reason' => $data['decisionReason'], 'decided_at' => now(),
            ]);
        });
        $this->cache->invalidate($accessRequest->tenant_id);
        AuditLogger::log($request, 'APPROVE', 'AuthorizationAccessRequest', null, ['request_id' => $accessRequest->id]);
        return response()->json(['success' => true, 'data' => $accessRequest->fresh()]);
    }

    public function reject(Request $request, AuthorizationAccessRequest $accessRequest)
    {
        $this->guardTenant($accessRequest);
        $data = $request->validate(['decisionReason' => ['required', 'string', 'min:5', 'max:1000']]);
        if ($accessRequest->status !== 'PENDING') {
            return response()->json(['success' => false, 'error' => ['code' => 'ACCESS_REQUEST_ALREADY_DECIDED', 'message' => 'This request has already been decided.']], 409);
        }
        $accessRequest->update(['status' => 'REJECTED', 'decided_by' => auth('api')->id(), 'decision_reason' => $data['decisionReason'], 'decided_at' => now()]);
        AuditLogger::log($request, 'REJECT', 'AuthorizationAccessRequest', null, ['request_id' => $accessRequest->id]);
        return response()->json(['success' => true, 'data' => $accessRequest]);
    }

    public function revoke(Request $request, AuthorizationAccessRequest $accessRequest)
    {
        $this->guardTenant($accessRequest);
        $data = $request->validate(['decisionReason' => ['required', 'string', 'min:5', 'max:1000']]);
        if ($accessRequest->status !== 'APPROVED') {
            return response()->json(['success' => false, 'error' => ['code' => 'ACCESS_REQUEST_NOT_ACTIVE', 'message' => 'Only approved access can be revoked.']], 409);
        }
        DB::transaction(function () use ($accessRequest, $data) {
            if ($accessRequest->role_id) {
                AuthorizationRoleAssignment::where('user_id', $accessRequest->target_user_id)
                    ->where('role_id', $accessRequest->role_id)->where('assignment_source', 'ACCESS_REQUEST')
                    ->where('status', 'ACTIVE')->update(['status' => 'REVOKED']);
            } elseif ($accessRequest->permission_code) {
                $permission = Permission::where('code', $accessRequest->permission_code)->first();
                if ($permission) {
                    DB::table('user_permissions')->where('user_id', $accessRequest->target_user_id)
                        ->where('permission_id', $permission->id)->update(['is_denied' => true]);
                }
            }
            $accessRequest->update([
                'status' => 'REVOKED', 'revoked_at' => now(), 'revoked_by' => auth('api')->id(),
                'decision_reason' => $data['decisionReason'],
            ]);
        });
        $this->cache->invalidate($accessRequest->tenant_id);
        AuditLogger::log($request, 'REVOKE', 'AuthorizationAccessRequest', null, ['request_id' => $accessRequest->id]);
        return response()->json(['success' => true, 'data' => $accessRequest->fresh()]);
    }

    private function guardTenant(AuthorizationAccessRequest $accessRequest): void
    {
        $actor = auth('api')->user();
        abort_unless((int) $actor->role === 0 || $accessRequest->tenant_id === $actor->company_code, 404);
    }
}
