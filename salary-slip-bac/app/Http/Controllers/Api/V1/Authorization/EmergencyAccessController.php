<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\SchemaSupport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class EmergencyAccessController extends Controller
{
    private const MAX_DURATION_HOURS = 24;

    public function __construct(private readonly AuthorizationCache $cache)
    {
    }

    public function index(Request $request)
    {
        $actor = auth('api')->user();

        $rows = DB::table('authorization_emergency_grants as g')
            ->leftJoin('users as holder', 'holder.id', '=', 'g.user_id')
            ->leftJoin('users as approver', 'approver.id', '=', 'g.approved_by')
            ->when((int) $actor->role !== 0, fn ($q) => $q->where('g.tenant_id', $actor->company_code))
            ->when($request->filled('status'), fn ($q) => $q->where('g.status', strtoupper($request->string('status'))))
            ->orderByDesc('g.created_at')
            ->limit(min((int) $request->input('limit', 50), 200))
            ->get([
                'g.id', 'g.grant_uuid', 'g.permission_codes', 'g.scope_type', 'g.scope_id',
                'g.reason', 'g.valid_from', 'g.valid_until', 'g.status', 'g.revoked_at',
                'g.created_at', 'holder.name as holder_name', 'approver.name as approver_name',
            ]);

        return response()->json([
            'success' => true,
            'data' => $rows->map(fn ($row) => [
                'id' => (int) $row->id,
                'grantUuid' => $row->grant_uuid,
                'holderName' => $row->holder_name,
                'approverName' => $row->approver_name,
                'permissionCodes' => json_decode($row->permission_codes, true) ?: [],
                'scopeType' => $row->scope_type,
                'scopeId' => $row->scope_id,
                'reason' => $row->reason,
                'validFrom' => $row->valid_from,
                'validUntil' => $row->valid_until,
                'status' => $this->effectiveStatus($row),
                'revokedAt' => $row->revoked_at,
                'createdAt' => $row->created_at,
            ]),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'userId' => ['required', 'integer', 'exists:users,id'],
            'permissionCodes' => ['required', 'array', 'min:1', 'max:50'],
            'permissionCodes.*' => ['string', 'max:190', 'exists:permissions,name'],
            'scopeType' => ['required', 'string', 'max:32'],
            'scopeId' => ['nullable', 'string', 'max:190'],
            'validUntil' => ['required', 'date', 'after:now'],
            'reason' => ['required', 'string', 'min:20', 'max:2000'],
        ]);

        $actor = auth('api')->user();

        if ((int) $data['userId'] === (int) $actor->id) {
            return $this->error('VALIDATION_FAILED', 'Emergency access must be granted by someone other than the holder.', 422);
        }

        if (now()->diffInHours($data['validUntil']) > self::MAX_DURATION_HOURS) {
            return $this->error(
                'VALIDATION_FAILED',
                'An emergency grant cannot run longer than ' . self::MAX_DURATION_HOURS . ' hours.',
                422
            );
        }

        $holder = DB::table('users')->where('id', $data['userId'])->first(['id', 'company_code']);

        $id = DB::table('authorization_emergency_grants')->insertGetId([
            'grant_uuid' => (string) Str::uuid(),
            'tenant_id' => $holder->company_code ?: null,
            'user_id' => $data['userId'],
            'permission_codes' => json_encode(array_values($data['permissionCodes'])),
            'scope_type' => $data['scopeType'],
            'scope_id' => $data['scopeId'] ?? null,
            'reason' => $data['reason'],
            'valid_from' => now(),
            'valid_until' => $data['validUntil'],
            'status' => 'ACTIVE',
            'approved_by' => $actor->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->audit($id, 'GRANT', $data, $data['reason']);
        $this->cache->invalidate($holder->company_code ?: null);

        return response()->json(['success' => true, 'data' => ['id' => $id]], 201);
    }

    public function revoke(Request $request, int $id)
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:1000']]);

        $actor = auth('api')->user();

        $grant = DB::table('authorization_emergency_grants')
            ->where('id', $id)
            ->when((int) $actor->role !== 0, fn ($q) => $q->where('tenant_id', $actor->company_code))
            ->first();

        if (!$grant) {
            return $this->error('NOT_FOUND', 'Emergency grant not found.', 404);
        }

        if ($grant->status !== 'ACTIVE') {
            return $this->error('VALIDATION_FAILED', 'This grant is not active.', 409);
        }

        DB::table('authorization_emergency_grants')->where('id', $id)->update([
            'status' => 'REVOKED',
            'revoked_at' => now(),
            'revoked_by' => $actor->id,
            'updated_at' => now(),
        ]);

        $this->audit($id, 'REVOKE', ['reason' => $data['reason']], $data['reason']);
        $this->cache->invalidate($grant->tenant_id);

        return response()->json(['success' => true, 'data' => ['id' => $id]]);
    }

    private function effectiveStatus(object $row): string
    {
        return $row->status === 'ACTIVE' && now()->greaterThan($row->valid_until) ? 'EXPIRED' : $row->status;
    }

    private function audit(int $id, string $changeType, array $values, ?string $reason): void
    {
        if (!SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return;
        }

        DB::table('authorization_permission_audit_logs')->insert([
            'event_id' => (string) Str::uuid(),
            'tenant_id' => auth('api')->user()?->company_code ?: null,
            'actor_id' => auth('api')->id(),
            'subject_type' => 'EMERGENCY_GRANT',
            'subject_id' => (string) $id,
            'subject_label' => 'emergency grant #' . $id,
            'change_type' => $changeType,
            'new_values' => json_encode($values),
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
