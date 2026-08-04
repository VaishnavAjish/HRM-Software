<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\SchemaSupport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class AccessRequestController extends Controller
{
    private const APPROVAL_CHAIN = ['MANAGER', 'RESOURCE_OWNER', 'SECURITY'];

    private const MAX_DURATION_DAYS = 180;

    public function __construct(private readonly AuthorizationCache $cache)
    {
    }

    public function index(Request $request)
    {
        $actor = auth('api')->user();

        $rows = DB::table('authorization_access_requests as r')
            ->leftJoin('users as requester', 'requester.id', '=', 'r.requester_id')
            ->leftJoin('users as target', 'target.id', '=', 'r.target_user_id')
            ->leftJoin('roles', 'roles.id', '=', 'r.role_id')
            ->when((int) $actor->role !== 0, fn ($q) => $q->where('r.tenant_id', $actor->company_code))
            ->when($request->filled('status'), fn ($q) => $q->where('r.status', strtoupper($request->string('status'))))
            ->when($request->boolean('mine'), fn ($q) => $q->where('r.requester_id', $actor->id))
            ->orderByDesc('r.created_at')
            ->limit(min((int) $request->input('limit', 50), 200))
            ->get([
                'r.id', 'r.permission_code', 'r.scope_type', 'r.scope_id', 'r.business_reason',
                'r.requested_until', 'r.status', 'r.decision_reason', 'r.decided_at', 'r.created_at',
                'requester.name as requester_name', 'target.name as target_name', 'roles.name as role_name',
            ]);

        $approvals = $this->approvalsFor($rows->pluck('id')->all());

        return response()->json([
            'success' => true,
            'data' => $rows->map(fn ($row) => [
                'id' => (int) $row->id,
                'requesterName' => $row->requester_name,
                'targetName' => $row->target_name ?: $row->requester_name,
                'roleName' => $row->role_name,
                'permissionCode' => $row->permission_code,
                'scopeType' => $row->scope_type,
                'scopeId' => $row->scope_id,
                'businessReason' => $row->business_reason,
                'requestedUntil' => $row->requested_until,
                'status' => $row->status,
                'decisionReason' => $row->decision_reason,
                'decidedAt' => $row->decided_at,
                'createdAt' => $row->created_at,
                'approvals' => $approvals[(int) $row->id] ?? [],
            ]),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'targetUserId' => ['nullable', 'integer', 'exists:users,id'],
            'roleId' => ['nullable', 'integer', 'exists:roles,id'],
            'permissionCode' => ['nullable', 'string', 'max:190', 'exists:permissions,name'],
            'scopeType' => ['required', 'string', 'max:32'],
            'scopeId' => ['nullable', 'string', 'max:190'],
            'requestedUntil' => ['nullable', 'date', 'after:now'],
            'businessReason' => ['required', 'string', 'min:10', 'max:2000'],
        ]);

        if (empty($data['roleId']) && empty($data['permissionCode'])) {
            return $this->error('VALIDATION_FAILED', 'Name either a role or a permission to request.', 422);
        }

        if (!empty($data['requestedUntil'])
            && now()->diffInDays($data['requestedUntil']) > self::MAX_DURATION_DAYS) {
            return $this->error(
                'VALIDATION_FAILED',
                'Access cannot be requested for longer than ' . self::MAX_DURATION_DAYS . ' days.',
                422
            );
        }

        $requester = auth('api')->user();

        $id = DB::transaction(function () use ($data, $requester) {
            $id = DB::table('authorization_access_requests')->insertGetId([
                'tenant_id' => $requester->company_code ?: null,
                'requester_id' => $requester->id,
                'target_user_id' => $data['targetUserId'] ?? $requester->id,
                'role_id' => $data['roleId'] ?? null,
                'permission_code' => $data['permissionCode'] ?? null,
                'scope_type' => $data['scopeType'],
                'scope_id' => $data['scopeId'] ?? null,
                'business_reason' => $data['businessReason'],
                'requested_until' => $data['requestedUntil'] ?? null,
                'status' => 'PENDING',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            foreach (self::APPROVAL_CHAIN as $index => $approverType) {
                DB::table('authorization_access_request_approvals')->insert([
                    'access_request_id' => $id,
                    'step' => $index + 1,
                    'approver_type' => $approverType,
                    'status' => 'PENDING',
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return $id;
        });

        $this->audit($id, 'REQUEST', $data['permissionCode'] ?? null, $data, $data['businessReason']);

        return response()->json(['success' => true, 'data' => ['id' => $id]], 201);
    }

    public function approve(Request $request, int $id)
    {
        return $this->decide($request, $id, 'APPROVED');
    }

    public function reject(Request $request, int $id)
    {
        return $this->decide($request, $id, 'REJECTED');
    }

    public function revoke(Request $request, int $id)
    {
        $data = $request->validate(['decisionReason' => ['required', 'string', 'min:5', 'max:1000']]);
        $accessRequest = $this->find($id);

        if (!$accessRequest) {
            return $this->error('NOT_FOUND', 'Access request not found.', 404);
        }

        if ($accessRequest->status !== 'APPROVED') {
            return $this->error('VALIDATION_FAILED', 'Only an approved request can be revoked.', 409);
        }

        $actor = auth('api')->user();

        DB::table('authorization_access_requests')->where('id', $id)->update([
            'status' => 'REVOKED',
            'revoked_at' => now(),
            'revoked_by' => $actor->id,
            'decision_reason' => $data['decisionReason'],
            'updated_at' => now(),
        ]);

        $this->audit($id, 'REVOKE', $accessRequest->permission_code, null, $data['decisionReason']);
        $this->cache->invalidate($accessRequest->tenant_id);

        return response()->json(['success' => true, 'data' => ['id' => $id, 'status' => 'REVOKED']]);
    }

    private function decide(Request $request, int $id, string $outcome)
    {
        $data = $request->validate(['decisionReason' => ['required', 'string', 'min:5', 'max:1000']]);
        $accessRequest = $this->find($id);

        if (!$accessRequest) {
            return $this->error('NOT_FOUND', 'Access request not found.', 404);
        }

        if ($accessRequest->status !== 'PENDING') {
            return $this->error('VALIDATION_FAILED', 'This request has already been decided.', 409);
        }

        $actor = auth('api')->user();

        if ((int) $accessRequest->requester_id === (int) $actor->id) {
            return $this->error('PERMISSION_DENIED', 'You cannot decide your own access request.', 403);
        }

        $step = DB::table('authorization_access_request_approvals')
            ->where('access_request_id', $id)
            ->where('status', 'PENDING')
            ->orderBy('step')
            ->first();

        if (!$step) {
            return $this->error('VALIDATION_FAILED', 'No approval step is outstanding.', 409);
        }

        DB::table('authorization_access_request_approvals')->where('id', $step->id)->update([
            'approver_id' => $actor->id,
            'status' => $outcome,
            'decision_reason' => $data['decisionReason'],
            'decided_at' => now(),
            'updated_at' => now(),
        ]);

        if ($outcome === 'REJECTED') {
            DB::table('authorization_access_request_approvals')
                ->where('access_request_id', $id)
                ->where('status', 'PENDING')
                ->update(['status' => 'SKIPPED', 'updated_at' => now()]);

            $this->close($id, 'REJECTED', $actor->id, $data['decisionReason']);
            $this->audit($id, 'REJECT', $accessRequest->permission_code, null, $data['decisionReason']);

            return response()->json(['success' => true, 'data' => ['id' => $id, 'status' => 'REJECTED']]);
        }

        $outstanding = DB::table('authorization_access_request_approvals')
            ->where('access_request_id', $id)
            ->where('status', 'PENDING')
            ->exists();

        if ($outstanding) {
            $this->audit($id, 'APPROVE_STEP', $accessRequest->permission_code, ['step' => $step->step], $data['decisionReason']);

            return response()->json(['success' => true, 'data' => ['id' => $id, 'status' => 'PENDING']]);
        }

        $this->close($id, 'APPROVED', $actor->id, $data['decisionReason']);
        $this->applyGrant($accessRequest, $actor);
        $this->audit($id, 'APPROVE', $accessRequest->permission_code, null, $data['decisionReason']);
        $this->cache->invalidate($accessRequest->tenant_id);

        return response()->json(['success' => true, 'data' => ['id' => $id, 'status' => 'APPROVED']]);
    }

    /** An approved role request is only real once the assignment exists. */
    private function applyGrant(object $accessRequest, User $actor): void
    {
        if (!$accessRequest->role_id || !SchemaSupport::hasTable('authorization_role_assignments')) {
            return;
        }

        $targetId = $accessRequest->target_user_id ?: $accessRequest->requester_id;
        $target = User::query()->find($targetId);

        if (!$target) {
            return;
        }

        $target->roles()->syncWithoutDetaching([$accessRequest->role_id]);

        DB::table('authorization_role_assignments')->updateOrInsert(
            [
                'user_id' => $targetId,
                'role_id' => $accessRequest->role_id,
                'tenant_id' => $accessRequest->tenant_id,
                'scope_type' => $accessRequest->scope_type,
                'scope_id' => $accessRequest->scope_id,
            ],
            [
                'valid_from' => now(),
                'valid_until' => $accessRequest->requested_until,
                'assignment_source' => 'ACCESS_REQUEST',
                'assignment_reason' => $accessRequest->business_reason,
                'assigned_by' => $actor->id,
                'approved_by' => $actor->id,
                'status' => 'ACTIVE',
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    private function close(int $id, string $status, int $actorId, string $reason): void
    {
        DB::table('authorization_access_requests')->where('id', $id)->update([
            'status' => $status,
            'decided_by' => $actorId,
            'decision_reason' => $reason,
            'decided_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /** @param list<int> $ids @return array<int, list<array>> */
    private function approvalsFor(array $ids): array
    {
        if (!$ids) {
            return [];
        }

        $rows = DB::table('authorization_access_request_approvals as a')
            ->leftJoin('users as approver', 'approver.id', '=', 'a.approver_id')
            ->whereIn('a.access_request_id', $ids)
            ->orderBy('a.step')
            ->get(['a.access_request_id', 'a.step', 'a.approver_type', 'a.status', 'a.decision_reason', 'a.decided_at', 'approver.name as approver_name']);

        $out = [];

        foreach ($rows as $row) {
            $out[(int) $row->access_request_id][] = [
                'step' => (int) $row->step,
                'approverType' => $row->approver_type,
                'approverName' => $row->approver_name,
                'status' => $row->status,
                'decisionReason' => $row->decision_reason,
                'decidedAt' => $row->decided_at,
            ];
        }

        return $out;
    }

    private function find(int $id): ?object
    {
        $actor = auth('api')->user();

        return DB::table('authorization_access_requests')
            ->where('id', $id)
            ->when((int) $actor->role !== 0, fn ($q) => $q->where('tenant_id', $actor->company_code))
            ->first();
    }

    private function audit(int $id, string $changeType, ?string $permissionCode, ?array $values, ?string $reason): void
    {
        if (!SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return;
        }

        DB::table('authorization_permission_audit_logs')->insert([
            'event_id' => (string) Str::uuid(),
            'tenant_id' => auth('api')->user()?->company_code ?: null,
            'actor_id' => auth('api')->id(),
            'subject_type' => 'ACCESS_REQUEST',
            'subject_id' => (string) $id,
            'subject_label' => 'access request #' . $id,
            'change_type' => $changeType,
            'permission_code' => $permissionCode,
            'new_values' => $values === null ? null : json_encode($values),
            'business_reason' => $reason,
            'ip_address' => request()?->ip(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function error(string $code, string $message, int $status)
    {
        return response()->json(['success' => false, 'error' => ['code' => $code, 'message' => $message]], $status);
    }
}
