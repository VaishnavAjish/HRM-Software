<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\FeatureFlags;
use App\Services\Authorization\SchemaSupport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DelegationController extends Controller
{
    private const MAX_DURATION_DAYS = 90;

    public function __construct(
        private readonly AuthorizationEngine $authorization,
        private readonly AuthorizationCache $cache,
        private readonly FeatureFlags $flags,
    ) {
    }

    public function index(Request $request)
    {
        $actor = auth('api')->user();

        $rows = DB::table('authorization_delegations as d')
            ->leftJoin('users as delegator', 'delegator.id', '=', 'd.delegator_id')
            ->leftJoin('users as delegate', 'delegate.id', '=', 'd.delegate_id')
            ->when((int) $actor->role !== 0, fn ($q) => $q->where('d.tenant_id', $actor->company_code))
            ->when($request->filled('status'), fn ($q) => $q->where('d.status', $request->string('status')))
            ->orderByDesc('d.created_at')
            ->limit(min((int) $request->input('limit', 25), 100))
            ->get([
                'd.id', 'd.delegator_id', 'd.delegate_id', 'd.permission_codes', 'd.scope_type', 'd.scope_id',
                'd.valid_from', 'd.valid_until', 'd.reason', 'd.status', 'd.accepted_at', 'd.declined_at',
                'd.created_at',
                'delegator.name as delegator_name', 'delegate.name as delegate_name',
            ]);

        return response()->json([
            'success' => true,
            'data' => $rows->map(fn ($row) => [
                'id' => $row->id,
                'delegatorId' => (int) $row->delegator_id,
                'delegatorName' => $row->delegator_name,
                'delegateId' => (int) $row->delegate_id,
                'delegateName' => $row->delegate_name,
                'permissionCodes' => json_decode($row->permission_codes, true) ?: [],
                'scopeType' => $row->scope_type,
                'scopeId' => $row->scope_id,
                'validFrom' => $row->valid_from,
                'validUntil' => $row->valid_until,
                'reason' => $row->reason,
                'status' => $this->effectiveStatus($row),
                'acceptedAt' => $row->accepted_at ?? null,
                'declinedAt' => $row->declined_at ?? null,
                'createdAt' => $row->created_at,
            ]),
        ]);
    }

    public function mine(Request $request)
    {
        $actor = auth('api')->user();

        $rows = DB::table('authorization_delegations as d')
            ->leftJoin('users as delegator', 'delegator.id', '=', 'd.delegator_id')
            ->leftJoin('users as delegate', 'delegate.id', '=', 'd.delegate_id')
            ->where(function ($q) use ($actor) {
                $q->where('d.delegate_id', $actor->id)->orWhere('d.delegator_id', $actor->id);
            })
            ->when($request->filled('status'), fn ($q) => $q->where('d.status', $request->string('status')))
            ->orderByDesc('d.created_at')
            ->limit(min((int) $request->input('limit', 25), 100))
            ->get([
                'd.id', 'd.delegator_id', 'd.delegate_id', 'd.permission_codes', 'd.scope_type', 'd.scope_id',
                'd.valid_from', 'd.valid_until', 'd.reason', 'd.status', 'd.accepted_at', 'd.declined_at',
                'd.created_at',
                'delegator.name as delegator_name', 'delegate.name as delegate_name',
            ]);

        return response()->json([
            'success' => true,
            'data' => $rows->map(fn ($row) => [
                'id' => $row->id,
                'delegatorId' => (int) $row->delegator_id,
                'delegatorName' => $row->delegator_name,
                'delegateId' => (int) $row->delegate_id,
                'delegateName' => $row->delegate_name,
                'permissionCodes' => json_decode($row->permission_codes, true) ?: [],
                'scopeType' => $row->scope_type,
                'scopeId' => $row->scope_id,
                'validFrom' => $row->valid_from,
                'validUntil' => $row->valid_until,
                'reason' => $row->reason,
                'status' => $this->effectiveStatus($row),
                'acceptedAt' => $row->accepted_at ?? null,
                'declinedAt' => $row->declined_at ?? null,
                'createdAt' => $row->created_at,
                'isDelegate' => (int) $row->delegate_id === (int) $actor->id,
                'isDelegator' => (int) $row->delegator_id === (int) $actor->id,
            ]),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'delegateId' => ['required', 'integer', 'exists:users,id'],
            'permissionCodes' => ['required', 'array', 'min:1', 'max:50'],
            'permissionCodes.*' => ['string', 'max:190', 'exists:permissions,name'],
            'scopeType' => ['required', 'string', 'max:32'],
            'scopeId' => ['nullable', 'string', 'max:190'],
            'validFrom' => ['required', 'date'],
            'validUntil' => ['required', 'date', 'after:validFrom'],
            'reason' => ['required', 'string', 'min:10', 'max:1000'],
        ]);

        $delegator = auth('api')->user();

        if ((int) $data['delegateId'] === (int) $delegator->id) {
            return $this->error('VALIDATION_FAILED', 'You cannot delegate to yourself.', 422);
        }

        if (now()->parse($data['validFrom'])->diffInDays($data['validUntil']) > self::MAX_DURATION_DAYS) {
            return $this->error(
                'VALIDATION_FAILED',
                'A delegation cannot run longer than ' . self::MAX_DURATION_DAYS . ' days.',
                422
            );
        }

        $shadow = $this->flags->enabled('authorization_shadow_mode', $delegator->company_code, true);
        $notHeld = [];

        foreach ($data['permissionCodes'] as $code) {
            $decision = $this->authorization->decide($delegator, $code, [], ['audit' => false]);
            $holds = $decision->allowed || ($shadow && ($decision->legacyDecision['allowed'] ?? false));

            if (!$holds) {
                $notHeld[] = $code;
            }
        }

        if ($notHeld) {
            return response()->json([
                'success' => false,
                'error' => [
                    'code' => 'PERMISSION_DENIED',
                    'message' => 'You cannot delegate access you do not hold yourself.',
                    'details' => $notHeld,
                ],
            ], 403);
        }

        $id = DB::table('authorization_delegations')->insertGetId([
            'tenant_id' => $delegator->company_code ?: null,
            'delegator_id' => $delegator->id,
            'delegate_id' => $data['delegateId'],
            'permission_codes' => json_encode(array_values($data['permissionCodes'])),
            'scope_type' => $data['scopeType'],
            'scope_id' => $data['scopeId'] ?? null,
            'valid_from' => $data['validFrom'],
            'valid_until' => $data['validUntil'],
            'reason' => $data['reason'],
            'status' => 'PENDING',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->audit($id, 'GRANT', $data);
        $this->cache->invalidate($delegator->company_code ?: null);

        return response()->json(['success' => true, 'data' => ['id' => $id]], 201);
    }

    public function accept(int $id)
    {
        $delegation = DB::table('authorization_delegations')->where('id', $id)->first();

        if (!$delegation) {
            return $this->error('NOT_FOUND', 'Delegation not found.', 404);
        }

        $actor = auth('api')->user();

        if ((int) $delegation->delegate_id !== (int) $actor->id) {
            return $this->error('PERMISSION_DENIED', 'Only the delegate may accept this delegation.', 403);
        }

        if ($delegation->status !== 'PENDING') {
            return $this->error('VALIDATION_FAILED', 'This delegation is not pending acceptance.', 409);
        }

        if (now()->greaterThan($delegation->valid_until)) {
            return $this->error('VALIDATION_FAILED', 'This delegation has already expired.', 409);
        }

        DB::table('authorization_delegations')->where('id', $id)->update([
            'status' => 'ACTIVE',
            'accepted_at' => now(),
            'updated_at' => now(),
        ]);

        $this->audit($id, 'ACCEPT', []);
        $this->cache->invalidate($delegation->tenant_id);

        return response()->json(['success' => true, 'data' => ['id' => $id]]);
    }

    public function decline(int $id)
    {
        $delegation = DB::table('authorization_delegations')->where('id', $id)->first();

        if (!$delegation) {
            return $this->error('NOT_FOUND', 'Delegation not found.', 404);
        }

        $actor = auth('api')->user();

        if ((int) $delegation->delegate_id !== (int) $actor->id) {
            return $this->error('PERMISSION_DENIED', 'Only the delegate may decline this delegation.', 403);
        }

        if ($delegation->status !== 'PENDING') {
            return $this->error('VALIDATION_FAILED', 'This delegation is not pending acceptance.', 409);
        }

        DB::table('authorization_delegations')->where('id', $id)->update([
            'status' => 'DECLINED',
            'declined_at' => now(),
            'updated_at' => now(),
        ]);

        $this->audit($id, 'DECLINE', []);

        return response()->json(['success' => true, 'data' => ['id' => $id]]);
    }

    public function revoke(Request $request, int $id)
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ]);

        $delegation = DB::table('authorization_delegations')->where('id', $id)->first();

        if (!$delegation) {
            return $this->error('NOT_FOUND', 'Delegation not found.', 404);
        }

        if (!in_array($delegation->status, ['ACTIVE', 'PENDING'], true)) {
            return $this->error('VALIDATION_FAILED', 'This delegation is not active.', 409);
        }

        $actor = auth('api')->user();

        if ((int) $delegation->delegator_id !== (int) $actor->id && (int) $actor->role !== 0) {
            return $this->error('PERMISSION_DENIED', 'Only the delegator or a global administrator may revoke this.', 403);
        }

        DB::table('authorization_delegations')->where('id', $id)->update([
            'status' => 'REVOKED',
            'revoked_reason' => $data['reason'],
            'updated_at' => now(),
        ]);

        $this->audit($id, 'REVOKE', ['reason' => $data['reason']]);
        $this->cache->invalidate($delegation->tenant_id);

        return response()->json(['success' => true, 'data' => ['id' => $id]]);
    }

    private function effectiveStatus(\stdClass $row): string
    {
        if (in_array($row->status, ['ACTIVE', 'PENDING'], true) && now()->greaterThan($row->valid_until)) {
            return 'EXPIRED';
        }

        return $row->status;
    }

    private function audit(int $id, string $changeType, array $values): void
    {
        if (!SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return;
        }

        DB::table('authorization_permission_audit_logs')->insert([
            'event_id' => (string) Str::uuid(),
            'tenant_id' => auth('api')->user()?->company_code ?: null,
            'actor_id' => auth('api')->id(),
            'subject_type' => 'DELEGATION',
            'subject_id' => (string) $id,
            'subject_label' => 'delegation #' . $id,
            'change_type' => $changeType,
            'new_values' => json_encode($values),
            'business_reason' => $values['reason'] ?? null,
            'ip_address' => request()?->ip(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function error(string $code, string $message, int $status)
    {
        return response()->json([
            'success' => false,
            'error' => ['code' => $code, 'message' => $message],
        ], $status);
    }
}
