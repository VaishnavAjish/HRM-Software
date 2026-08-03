<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\AuthorizationPolicy;
use App\Models\AuthorizationPolicyVersion;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\ConditionEvaluator;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class PolicyController extends Controller
{
    public function __construct(
        private readonly ConditionEvaluator $conditions,
        private readonly AuthorizationCache $cache,
    ) {
    }

    public function index(Request $request)
    {
        $actor = auth('api')->user();
        $query = AuthorizationPolicy::withCount('versions')->orderByDesc('priority')->orderBy('name');
        if ((int) $actor->role !== 0) {
            $query->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $actor->company_code));
        }
        foreach (['status', 'effect'] as $filter) {
            if ($request->filled($filter)) {
                $query->where($filter, $request->query($filter));
            }
        }
        if ($search = trim((string) $request->query('search'))) {
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%"));
        }
        return response()->json(['success' => true, 'data' => $query->paginate(min(100, max(1, (int) $request->query('limit', 25))))]);
    }

    public function show(AuthorizationPolicy $policy)
    {
        return response()->json(['success' => true, 'data' => $policy->load(['versions' => fn ($q) => $q->orderByDesc('version')])]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $this->conditions->validate($data['conditions'] ?? null);
        $policy = DB::transaction(function () use ($data, $request) {
            $policy = AuthorizationPolicy::create($data + [
                'status' => 'DRAFT', 'version' => 1,
                'created_by' => auth('api')->id(), 'updated_by' => auth('api')->id(),
            ]);
            $this->version($policy, $request->input('changeSummary', 'Initial policy version'));
            return $policy;
        });
        $this->cache->invalidate($policy->tenant_id);
        AuditLogger::log($request, 'CREATE', 'AuthorizationPolicy', null, ['policy_id' => $policy->id, 'code' => $policy->code]);
        return response()->json(['success' => true, 'data' => $policy->load('versions')], 201);
    }

    public function update(Request $request, AuthorizationPolicy $policy)
    {
        $data = $this->validated($request, $policy);
        $this->conditions->validate($data['conditions'] ?? null);
        DB::transaction(function () use ($data, $request, $policy) {
            $policy->fill($data);
            $policy->version++;
            $policy->status = 'DRAFT';
            $policy->updated_by = auth('api')->id();
            $policy->save();
            $this->version($policy, $request->input('changeSummary', 'Policy updated'));
        });
        $this->cache->invalidate($policy->tenant_id);
        AuditLogger::log($request, 'UPDATE', 'AuthorizationPolicy', ['policy_id' => $policy->id], ['version' => $policy->version]);
        return response()->json(['success' => true, 'data' => $policy->fresh()->load('versions')]);
    }

    public function publish(Request $request, AuthorizationPolicy $policy)
    {
        $request->validate(['changeSummary' => ['nullable', 'string', 'max:1000']]);
        $policy->forceFill([
            'status' => 'ACTIVE', 'approved_by' => auth('api')->id(),
            'approved_at' => now(), 'valid_from' => $policy->valid_from ?: now(),
        ])->save();
        $latest = $policy->versions()->where('version', $policy->version)->first();
        $latest?->update([
            'approved_by' => auth('api')->id(), 'approved_at' => now(),
            'effective_at' => $policy->valid_from, 'deployment_status' => 'DEPLOYED',
        ]);
        $this->cache->invalidate($policy->tenant_id);
        AuditLogger::log($request, 'PUBLISH', 'AuthorizationPolicy', null, ['policy_id' => $policy->id, 'version' => $policy->version]);
        return response()->json(['success' => true, 'data' => $policy->fresh()]);
    }

    public function rollback(Request $request, AuthorizationPolicy $policy)
    {
        $data = $request->validate([
            'version' => ['required', 'integer', 'min:1'],
            'changeSummary' => ['required', 'string', 'min:5', 'max:1000'],
        ]);
        $target = $policy->versions()->where('version', $data['version'])->firstOrFail();
        DB::transaction(function () use ($policy, $target, $data) {
            $snapshot = $target->snapshot;
            $policy->fill(collect($snapshot)->except(['id', 'created_at', 'updated_at', 'version', 'created_by'])->all());
            $policy->version++;
            $policy->status = 'ACTIVE';
            $policy->updated_by = auth('api')->id();
            $policy->approved_by = auth('api')->id();
            $policy->approved_at = now();
            $policy->save();
            $version = $this->version($policy, $data['changeSummary'], $target->id);
            $version->update(['approved_by' => auth('api')->id(), 'approved_at' => now(), 'effective_at' => now(), 'deployment_status' => 'ROLLED_BACK']);
        });
        $this->cache->invalidate($policy->tenant_id);
        AuditLogger::log($request, 'ROLLBACK', 'AuthorizationPolicy', ['target_version' => $data['version']], ['active_version' => $policy->version]);
        return response()->json(['success' => true, 'data' => $policy->fresh()->load('versions')]);
    }

    private function validated(Request $request, ?AuthorizationPolicy $policy = null): array
    {
        return $request->validate([
            'tenant_id' => ['nullable', 'string', 'max:100'],
            'code' => ['required', 'string', 'max:150', 'regex:/^[a-z][a-z0-9_.]*$/', Rule::unique('authorization_policies', 'code')->ignore($policy?->id)],
            'name' => ['required', 'string', 'max:190'],
            'description' => ['nullable', 'string', 'max:2000'],
            'effect' => ['required', Rule::in(['ALLOW', 'DENY'])],
            'subjects' => ['nullable', 'array'], 'actions' => ['required', 'array', 'min:1'],
            'actions.*' => ['string', 'max:190'], 'resources' => ['required', 'array', 'min:1'],
            'resources.*' => ['string', 'max:190'],
            'scope_type' => ['required', 'string', 'max:32'], 'scope_id' => ['nullable', 'string', 'max:500'],
            'conditions' => ['nullable', 'array'], 'obligations' => ['nullable', 'array'],
            'priority' => ['integer', 'between:-10000,10000'],
            'valid_from' => ['nullable', 'date'], 'valid_until' => ['nullable', 'date', 'after:valid_from'],
            'audit_required' => ['boolean'], 'changeSummary' => ['nullable', 'string', 'max:1000'],
        ]);
    }

    private function version(AuthorizationPolicy $policy, string $summary, ?int $previousVersionId = null): AuthorizationPolicyVersion
    {
        $previous = $previousVersionId
            ? AuthorizationPolicyVersion::find($previousVersionId)
            : $policy->versions()->orderByDesc('version')->first();
        return AuthorizationPolicyVersion::create([
            'policy_id' => $policy->id, 'version' => $policy->version,
            'snapshot' => $policy->fresh()->toArray(), 'change_summary' => $summary,
            'previous_version_id' => $previous?->id, 'changed_by' => auth('api')->id(),
            'deployment_status' => 'PENDING',
        ]);
    }
}
