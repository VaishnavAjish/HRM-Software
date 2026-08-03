<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\AuthorizationEngine;
use App\Models\User;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class AccessLifecycleController extends Controller
{
    public function __construct(private readonly AuthorizationCache $cache, private readonly AuthorizationEngine $authorization) {}

    public function delegations(Request $request)
    {
        return response()->json(['success' => true, 'data' => DB::table('authorization_delegations')
            ->where(fn ($q) => (int) auth('api')->user()->role === 0 ? $q : $q->where('tenant_id', auth('api')->user()->company_code))
            ->orderByDesc('id')->paginate(min(100, max(1, (int) $request->query('limit', 25))))]);
    }

    public function createDelegation(Request $request)
    {
        $data = $request->validate([
            'delegateId' => ['required', 'different:delegatorId', 'exists:users,id'],
            'permissionCodes' => ['required', 'array', 'min:1', 'max:100'], 'permissionCodes.*' => ['string', 'exists:permissions,code'],
            'scopeType' => ['required', 'string', 'max:32'], 'scopeId' => ['nullable', 'string', 'max:500'],
            'validFrom' => ['required', 'date'], 'validUntil' => ['required', 'date', 'after:validFrom'],
            'reason' => ['required', 'string', 'min:10', 'max:1000'],
        ]);
        $actor = auth('api')->user();
        $delegate = User::findOrFail($data['delegateId']);
        if ((int) $actor->role !== 0 && $delegate->company_code !== $actor->company_code) {
            return response()->json(['success' => false, 'error' => ['code' => 'TENANT_ACCESS_DENIED', 'message' => 'Delegation cannot cross tenant boundaries.']], 403);
        }
        foreach ($data['permissionCodes'] as $permissionCode) {
            if (!$this->authorization->decide($actor, $permissionCode, ['company_code' => $actor->company_code], ['audit' => false])->allowed) {
                return response()->json(['success' => false, 'error' => ['code' => 'DELEGATION_EXCEEDS_AUTHORITY', 'message' => "You cannot delegate {$permissionCode} because you do not hold it."]], 403);
            }
        }
        $id = DB::table('authorization_delegations')->insertGetId([
            'tenant_id' => $actor->company_code, 'delegator_id' => $actor->id, 'delegate_id' => $data['delegateId'],
            'permission_codes' => json_encode(array_values(array_unique($data['permissionCodes']))),
            'scope_type' => strtoupper($data['scopeType']), 'scope_id' => $data['scopeId'] ?? null,
            'valid_from' => $data['validFrom'], 'valid_until' => $data['validUntil'], 'reason' => $data['reason'],
            'status' => 'ACTIVE', 'approved_by' => $actor->id, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->cache->invalidate($actor->company_code);
        AuditLogger::log($request, 'CREATE', 'AuthorizationDelegation', null, ['id' => $id, 'delegate_id' => $data['delegateId']]);
        return response()->json(['success' => true, 'data' => DB::table('authorization_delegations')->find($id)], 201);
    }

    public function revokeDelegation(Request $request, int $id)
    {
        $row = DB::table('authorization_delegations')->find($id);
        abort_unless($row && ((int) auth('api')->user()->role === 0 || $row->tenant_id === auth('api')->user()->company_code), 404);
        DB::table('authorization_delegations')->where('id', $id)->update(['status' => 'REVOKED', 'updated_at' => now()]);
        $this->cache->invalidate($row->tenant_id);
        AuditLogger::log($request, 'REVOKE', 'AuthorizationDelegation', ['id' => $id]);
        return response()->json(['success' => true]);
    }

    public function emergencyGrants(Request $request)
    {
        $actor = auth('api')->user();
        return response()->json(['success' => true, 'data' => DB::table('authorization_emergency_grants')
            ->when((int) $actor->role !== 0, fn ($q) => $q->where('tenant_id', $actor->company_code))
            ->orderByDesc('id')->paginate(min(100, max(1, (int) $request->query('limit', 25))))]);
    }

    public function createEmergencyGrant(Request $request)
    {
        $data = $request->validate([
            'userId' => ['required', 'exists:users,id'], 'permissionCodes' => ['required', 'array', 'min:1', 'max:100'],
            'permissionCodes.*' => ['string', 'exists:permissions,code'], 'scopeType' => ['required', 'string', 'max:32'],
            'scopeId' => ['nullable', 'string', 'max:500'], 'validUntil' => ['required', 'date', 'after:now'],
            'reason' => ['required', 'string', 'min:15', 'max:1000'],
        ]);
        $actor = auth('api')->user();
        $id = DB::table('authorization_emergency_grants')->insertGetId([
            'grant_uuid' => (string) Str::uuid(), 'tenant_id' => $actor->company_code, 'user_id' => $data['userId'],
            'permission_codes' => json_encode(array_values(array_unique($data['permissionCodes']))),
            'scope_type' => strtoupper($data['scopeType']), 'scope_id' => $data['scopeId'] ?? null,
            'reason' => $data['reason'], 'valid_from' => now(), 'valid_until' => $data['validUntil'],
            'status' => 'ACTIVE', 'approved_by' => $actor->id, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->cache->invalidate($actor->company_code);
        AuditLogger::log($request, 'CREATE', 'EmergencyAccessGrant', null, ['id' => $id, 'user_id' => $data['userId']]);
        return response()->json(['success' => true, 'data' => DB::table('authorization_emergency_grants')->find($id)], 201);
    }

    public function revokeEmergencyGrant(Request $request, int $id)
    {
        $row = DB::table('authorization_emergency_grants')->find($id);
        abort_unless($row && ((int) auth('api')->user()->role === 0 || $row->tenant_id === auth('api')->user()->company_code), 404);
        DB::table('authorization_emergency_grants')->where('id', $id)->update([
            'status' => 'REVOKED', 'revoked_at' => now(), 'revoked_by' => auth('api')->id(), 'updated_at' => now(),
        ]);
        $this->cache->invalidate($row->tenant_id);
        AuditLogger::log($request, 'REVOKE', 'EmergencyAccessGrant', ['id' => $id]);
        return response()->json(['success' => true]);
    }
}
