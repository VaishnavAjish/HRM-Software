<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\SchemaSupport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PolicyController extends Controller
{
    private const EFFECTS = ['ALLOW', 'DENY'];

    private const STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

    public function __construct(private readonly AuthorizationCache $cache)
    {
    }

    public function index(Request $request)
    {
        $actor = auth('api')->user();

        $rows = DB::table('authorization_policies as p')
            ->leftJoin('users as author', 'author.id', '=', 'p.created_by')
            ->when((int) $actor->role !== 0, fn ($q) => $q->where('p.tenant_id', $actor->company_code))
            ->when($request->filled('status'), fn ($q) => $q->where('p.status', strtoupper($request->string('status'))))
            ->when($request->filled('search'), function ($q) use ($request) {
                $like = '%' . trim((string) $request->input('search')) . '%';
                $operator = DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';

                $q->where(fn ($inner) => $inner->where('p.name', $operator, $like)->orWhere('p.code', $operator, $like));
            })
            ->orderByDesc('p.priority')
            ->orderByDesc('p.updated_at')
            ->limit(min((int) $request->input('limit', 50), 200))
            ->get([
                'p.id', 'p.code', 'p.name', 'p.description', 'p.effect', 'p.scope_type', 'p.scope_id',
                'p.priority', 'p.status', 'p.version', 'p.valid_from', 'p.valid_until',
                'p.audit_required', 'p.created_at', 'p.updated_at', 'author.name as author_name',
            ]);

        return response()->json(['success' => true, 'data' => $rows->map(fn ($row) => $this->present($row))]);
    }

    public function show(int $id)
    {
        $policy = $this->find($id);

        if (!$policy) {
            return $this->error('NOT_FOUND', 'Policy not found.', 404);
        }

        $versions = DB::table('authorization_policy_versions')
            ->where('policy_id', $id)
            ->orderByDesc('version')
            ->limit(25)
            ->get(['id', 'version', 'change_summary', 'deployment_status', 'effective_at', 'created_at']);

        return response()->json([
            'success' => true,
            'data' => array_merge($this->present($policy), [
                'subjects' => $this->decode($policy->subjects),
                'actions' => $this->decode($policy->actions),
                'resources' => $this->decode($policy->resources),
                'conditions' => $this->decode($policy->conditions),
                'obligations' => $this->decode($policy->obligations),
                'versions' => $versions->map(static fn ($row) => [
                    'id' => (int) $row->id,
                    'version' => (int) $row->version,
                    'changeSummary' => $row->change_summary,
                    'deploymentStatus' => $row->deployment_status,
                    'effectiveAt' => $row->effective_at,
                    'createdAt' => $row->created_at,
                ]),
            ]),
        ]);
    }

    public function store(Request $request)
    {
        $data = $this->validatePayload($request);
        $actor = auth('api')->user();

        if (DB::table('authorization_policies')->where('code', $data['code'])->exists()) {
            return $this->error('VALIDATION_FAILED', 'A policy with that code already exists.', 422);
        }

        $id = DB::table('authorization_policies')->insertGetId([
            'tenant_id' => $actor->company_code ?: null,
            'code' => $data['code'],
            'name' => $data['name'],
            'description' => $data['description'] ?? null,
            'effect' => $data['effect'],
            'subjects' => json_encode($data['subjects'] ?? []),
            'actions' => json_encode($data['actions']),
            'resources' => json_encode($data['resources']),
            'scope_type' => $data['scopeType'],
            'scope_id' => $data['scopeId'] ?? null,
            'conditions' => json_encode($data['conditions'] ?? []),
            'obligations' => json_encode($data['obligations'] ?? []),
            'priority' => $data['priority'] ?? 100,
            'valid_from' => $data['validFrom'] ?? null,
            'valid_until' => $data['validUntil'] ?? null,
            'status' => 'DRAFT',
            'version' => 1,
            'audit_required' => $data['auditRequired'] ?? false,
            'created_by' => $actor->id,
            'updated_by' => $actor->id,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->snapshot($id, 1, 'Created', $actor->id, 'DRAFT');
        $this->audit($id, 'CREATE', $data['code'], null, $data, $data['businessReason'] ?? null);

        return response()->json(['success' => true, 'data' => ['id' => $id]], 201);
    }

    public function update(Request $request, int $id)
    {
        $policy = $this->find($id);

        if (!$policy) {
            return $this->error('NOT_FOUND', 'Policy not found.', 404);
        }

        if ($policy->status === 'ARCHIVED') {
            return $this->error('VALIDATION_FAILED', 'An archived policy cannot be edited.', 409);
        }

        $data = $this->validatePayload($request, false);
        $actor = auth('api')->user();
        $version = (int) $policy->version + 1;

        $values = ['updated_by' => $actor->id, 'version' => $version, 'updated_at' => now()];

        foreach ([
            'name' => 'name', 'description' => 'description', 'effect' => 'effect',
            'scopeType' => 'scope_type', 'scopeId' => 'scope_id', 'priority' => 'priority',
            'validFrom' => 'valid_from', 'validUntil' => 'valid_until', 'auditRequired' => 'audit_required',
        ] as $input => $column) {
            if (array_key_exists($input, $data)) {
                $values[$column] = $data[$input];
            }
        }

        foreach (['subjects', 'actions', 'resources', 'conditions', 'obligations'] as $json) {
            if (array_key_exists($json, $data)) {
                $values[$json] = json_encode($data[$json]);
            }
        }

        // A published policy that is edited returns to draft: the engine reads
        // PUBLISHED rows, so an unreviewed edit must not go live on save.
        if ($policy->status === 'PUBLISHED') {
            $values['status'] = 'DRAFT';
        }

        DB::table('authorization_policies')->where('id', $id)->update($values);

        $this->snapshot($id, $version, $data['businessReason'] ?? 'Updated', $actor->id, 'DRAFT');
        $this->audit($id, 'UPDATE', $policy->code, $this->present($policy), $data, $data['businessReason'] ?? null);
        $this->cache->invalidate($policy->tenant_id);

        return response()->json(['success' => true, 'data' => ['id' => $id, 'version' => $version]]);
    }

    public function publish(Request $request, int $id)
    {
        $data = $request->validate(['businessReason' => ['required', 'string', 'min:10', 'max:1000']]);
        $policy = $this->find($id);

        if (!$policy) {
            return $this->error('NOT_FOUND', 'Policy not found.', 404);
        }

        if ($policy->status === 'PUBLISHED') {
            return $this->error('VALIDATION_FAILED', 'This policy is already published.', 409);
        }

        $actor = auth('api')->user();

        DB::table('authorization_policies')->where('id', $id)->update([
            'status' => 'PUBLISHED',
            'approved_by' => $actor->id,
            'approved_at' => now(),
            'updated_by' => $actor->id,
            'updated_at' => now(),
        ]);

        DB::table('authorization_policy_versions')
            ->where('policy_id', $id)
            ->where('version', $policy->version)
            ->update([
                'deployment_status' => 'DEPLOYED',
                'approved_by' => $actor->id,
                'approved_at' => now(),
                'effective_at' => now(),
                'updated_at' => now(),
            ]);

        $this->audit($id, 'PUBLISH', $policy->code, null, ['version' => $policy->version], $data['businessReason']);
        $this->cache->invalidate($policy->tenant_id);

        return response()->json(['success' => true, 'data' => ['id' => $id, 'status' => 'PUBLISHED']]);
    }

    public function rollback(Request $request, int $id)
    {
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:1'],
            'businessReason' => ['required', 'string', 'min:10', 'max:1000'],
        ]);

        $policy = $this->find($id);

        if (!$policy) {
            return $this->error('NOT_FOUND', 'Policy not found.', 404);
        }

        $target = DB::table('authorization_policy_versions')
            ->where('policy_id', $id)
            ->where('version', $data['version'])
            ->first();

        if (!$target) {
            return $this->error('NOT_FOUND', 'That version does not exist for this policy.', 404);
        }

        $snapshot = json_decode($target->snapshot, true) ?: [];
        $actor = auth('api')->user();
        $version = (int) $policy->version + 1;

        DB::table('authorization_policies')->where('id', $id)->update([
            'name' => $snapshot['name'] ?? $policy->name,
            'description' => $snapshot['description'] ?? $policy->description,
            'effect' => $snapshot['effect'] ?? $policy->effect,
            'subjects' => json_encode($snapshot['subjects'] ?? []),
            'actions' => json_encode($snapshot['actions'] ?? []),
            'resources' => json_encode($snapshot['resources'] ?? []),
            'conditions' => json_encode($snapshot['conditions'] ?? []),
            'obligations' => json_encode($snapshot['obligations'] ?? []),
            'scope_type' => $snapshot['scopeType'] ?? $policy->scope_type,
            'scope_id' => $snapshot['scopeId'] ?? $policy->scope_id,
            'priority' => $snapshot['priority'] ?? $policy->priority,
            'status' => 'DRAFT',
            'version' => $version,
            'updated_by' => $actor->id,
            'updated_at' => now(),
        ]);

        $this->snapshot($id, $version, 'Rolled back to version ' . $data['version'], $actor->id, 'DRAFT');
        $this->audit($id, 'ROLLBACK', $policy->code, null, ['toVersion' => $data['version']], $data['businessReason']);
        $this->cache->invalidate($policy->tenant_id);

        return response()->json(['success' => true, 'data' => ['id' => $id, 'version' => $version]]);
    }

    private function validatePayload(Request $request, bool $creating = true): array
    {
        $required = $creating ? 'required' : 'sometimes';

        return $request->validate([
            'code' => [$creating ? 'required' : 'prohibited', 'string', 'max:190', 'regex:/^[a-z0-9._-]+$/'],
            'name' => [$required, 'string', 'max:190'],
            'description' => ['nullable', 'string', 'max:2000'],
            'effect' => [$required, 'string', 'in:' . implode(',', self::EFFECTS)],
            'subjects' => ['nullable', 'array'],
            'actions' => [$required, 'array', 'min:1'],
            'actions.*' => ['string', 'max:190'],
            'resources' => [$required, 'array', 'min:1'],
            'resources.*' => ['string', 'max:190'],
            'conditions' => ['nullable', 'array'],
            'obligations' => ['nullable', 'array'],
            'scopeType' => [$required, 'string', 'max:32'],
            'scopeId' => ['nullable', 'string', 'max:190'],
            'priority' => ['nullable', 'integer', 'min:1', 'max:1000'],
            'validFrom' => ['nullable', 'date'],
            'validUntil' => ['nullable', 'date', 'after:validFrom'],
            'auditRequired' => ['nullable', 'boolean'],
            'businessReason' => ['nullable', 'string', 'max:1000'],
        ]);
    }

    private function find(int $id): ?object
    {
        $actor = auth('api')->user();

        return DB::table('authorization_policies')
            ->where('id', $id)
            ->when((int) $actor->role !== 0, fn ($q) => $q->where('tenant_id', $actor->company_code))
            ->first();
    }

    private function present(object $row): array
    {
        return [
            'id' => (int) $row->id,
            'code' => $row->code,
            'name' => $row->name,
            'description' => $row->description,
            'effect' => $row->effect,
            'scopeType' => $row->scope_type,
            'scopeId' => $row->scope_id,
            'priority' => (int) $row->priority,
            'status' => $row->status,
            'version' => (int) $row->version,
            'validFrom' => $row->valid_from,
            'validUntil' => $row->valid_until,
            'auditRequired' => (bool) $row->audit_required,
            'authorName' => $row->author_name ?? null,
            'createdAt' => $row->created_at,
            'updatedAt' => $row->updated_at,
        ];
    }

    private function decode(?string $value): array
    {
        return $value ? (json_decode($value, true) ?: []) : [];
    }

    private function snapshot(int $policyId, int $version, string $summary, int $actorId, string $status): void
    {
        $policy = DB::table('authorization_policies')->where('id', $policyId)->first();

        DB::table('authorization_policy_versions')->insert([
            'policy_id' => $policyId,
            'version' => $version,
            'snapshot' => json_encode([
                'name' => $policy->name,
                'description' => $policy->description,
                'effect' => $policy->effect,
                'subjects' => $this->decode($policy->subjects),
                'actions' => $this->decode($policy->actions),
                'resources' => $this->decode($policy->resources),
                'conditions' => $this->decode($policy->conditions),
                'obligations' => $this->decode($policy->obligations),
                'scopeType' => $policy->scope_type,
                'scopeId' => $policy->scope_id,
                'priority' => (int) $policy->priority,
            ]),
            'change_summary' => $summary,
            'changed_by' => $actorId,
            'deployment_status' => $status,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function audit(int $id, string $changeType, string $code, ?array $old, ?array $new, ?string $reason): void
    {
        if (!SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return;
        }

        DB::table('authorization_permission_audit_logs')->insert([
            'event_id' => (string) Str::uuid(),
            'tenant_id' => auth('api')->user()?->company_code ?: null,
            'actor_id' => auth('api')->id(),
            'subject_type' => 'POLICY',
            'subject_id' => (string) $id,
            'subject_label' => $code,
            'change_type' => $changeType,
            'old_values' => $old === null ? null : json_encode($old),
            'new_values' => $new === null ? null : json_encode($new),
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
