<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\AuthorizationFeatureFlag;
use App\Models\Permission;
use App\Models\User;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\FeatureFlags;
use App\Services\Authorization\SchemaSupport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

class AuthorizationController extends Controller
{
    public function __construct(
        private readonly AuthorizationEngine $authorization,
        private readonly AuthorizationCache $cache,
        private readonly FeatureFlags $flags,
    ) {
    }

    public function check(Request $request)
    {
        $data = $request->validate([
            'permissionCode' => ['required', 'string', 'max:190'],
            'resource' => ['nullable', 'array'],
            'context' => ['nullable', 'array'],
        ]);
        $decision = $this->authorization->decide(
            auth('api')->user(),
            $data['permissionCode'],
            $data['resource'] ?? [],
            $data['context'] ?? []
        );
        return response()->json(['success' => true, 'data' => $decision->toArray()]);
    }

    public function checkBatch(Request $request)
    {
        $data = $request->validate([
            'checks' => ['required', 'array', 'min:1', 'max:100'],
            'checks.*.permissionCode' => ['required', 'string', 'max:190'],
            'checks.*.resource' => ['nullable', 'array'],
            'checks.*.context' => ['nullable', 'array'],
        ]);
        $actor = auth('api')->user();
        $results = [];
        foreach ($data['checks'] as $index => $check) {
            $results[] = [
                'index' => $index,
                'permissionCode' => $check['permissionCode'],
                'decision' => $this->authorization->decide(
                    $actor,
                    $check['permissionCode'],
                    $check['resource'] ?? [],
                    $check['context'] ?? []
                )->toArray(),
            ];
        }
        return response()->json(['success' => true, 'data' => ['results' => $results]]);
    }

    public function simulate(Request $request)
    {
        $data = $request->validate([
            'subjectId' => ['required', 'integer', 'exists:users,id'],
            'permissionCode' => ['required', 'string', 'max:190'],
            'resource' => ['nullable', 'array'],
            'context' => ['nullable', 'array'],
        ]);
        $subject = User::findOrFail($data['subjectId']);
        $decision = $this->authorization->decide(
            $subject,
            $data['permissionCode'],
            $data['resource'] ?? [],
            array_merge($data['context'] ?? [], ['business_reason' => 'AUTHORIZATION_SIMULATION'])
        );
        return response()->json(['success' => true, 'data' => [
            'subject' => ['id' => $subject->id, 'name' => $subject->name, 'companyCode' => $subject->company_code],
            'decision' => $decision->toArray(),
        ]]);
    }

    public function me(Request $request)
    {
        $actor = auth('api')->user();
        $permissions = Permission::query()
            ->when(
                SchemaSupport::hasColumn('permissions', 'is_active'),
                fn ($q) => $q->where('is_active', true)
            )
            ->orderBy(SchemaSupport::hasColumn('permissions', 'code') ? 'code' : 'name')
            ->limit(1000)
            ->get();
        $decisions = [];
        $shadow = $this->flags->enabled('authorization_shadow_mode', $actor->company_code, true);
        foreach ($permissions as $permission) {
            $code = $permission->code ?: $permission->name;
            $decision = $this->authorization->decide($actor, $code, [
                'resource_type' => $permission->resource,
                'company_code' => $actor->company_code,
            ], ['audit' => false]);
            $decisions[$code] = [
                'allowed' => $decision->allowed || ($shadow && ($decision->legacyDecision['allowed'] ?? false)),
                'engineAllowed' => $decision->allowed,
                'state' => $decision->effectiveState,
                'obligations' => $decision->obligations,
                'shadowFallback' => !$decision->allowed && $shadow && ($decision->legacyDecision['allowed'] ?? false),
            ];
        }
        return response()->json(['success' => true, 'data' => [
            'authorizationVersion' => 'v2',
            'cacheVersion' => $this->cache->version($actor->company_code),
            'permissions' => $decisions,
            'roles' => $this->roleSnapshot($actor),
            'featureFlags' => $this->flagSnapshot($actor->company_code),
        ]]);
    }

    public function flags(Request $request)
    {
        return response()->json(['success' => true, 'data' => $this->flagSnapshot(auth('api')->user()->company_code)]);
    }

    public function updateFlags(Request $request)
    {
        $data = $request->validate([
            'tenantId' => ['nullable', 'string', 'max:100'],
            'flags' => ['required', 'array', 'min:1'],
            'flags.*' => ['boolean'],
        ]);
        $tenant = $data['tenantId'] ?: '*';
        foreach ($data['flags'] as $key => $enabled) {
            AuthorizationFeatureFlag::updateOrCreate(
                ['tenant_id' => $tenant, 'key' => $key],
                ['enabled' => $enabled, 'updated_by' => auth('api')->id()]
            );
            $this->flags->forget($key, $tenant === '*' ? null : $tenant);
        }
        $this->cache->invalidate($tenant === '*' ? null : $tenant);
        return response()->json(['success' => true, 'data' => $this->flagSnapshot($tenant)]);
    }

    /**
     * The caller's roles, scoped where the enterprise assignment table exists.
     *
     * Without that table the only role source is the base user_roles pivot,
     * which carries no scope or validity — those fields report null rather than
     * the endpoint failing, so a pre-enterprise deployment still gets a usable
     * snapshot instead of a 500.
     */
    private function roleSnapshot(User $actor): array
    {
        if (SchemaSupport::hasTable('authorization_role_assignments')) {
            return $actor->authorizationRoleAssignments()->active()->with('role:id,name,code,role_type')->get()
                ->map(fn ($assignment) => [
                    'code' => $assignment->role?->code, 'name' => $assignment->role?->name,
                    'type' => $assignment->role?->role_type, 'scopeType' => $assignment->scope_type,
                    'scopeId' => $assignment->scope_id, 'validUntil' => $assignment->valid_until,
                ])->values()->all();
        }

        return $actor->roles()->get()
            ->map(fn ($role) => [
                'code' => $role->code ?: Str::slug($role->name, '_'), 'name' => $role->name,
                'type' => $role->role_type ?? $role->type, 'scopeType' => null,
                'scopeId' => null, 'validUntil' => null,
            ])->values()->all();
    }

    private function flagSnapshot(?string $tenantId): array
    {
        $keys = [
            'authorization_engine_v2', 'authorization_shadow_mode',
            'authorization_field_security', 'authorization_row_security',
            'authorization_policy_builder', 'authorization_access_requests',
            'authorization_emergency_access',
        ];
        return collect($keys)->mapWithKeys(fn ($key) => [
            $key => $this->flags->enabled($key, $tenantId, false),
        ])->all();
    }
}
