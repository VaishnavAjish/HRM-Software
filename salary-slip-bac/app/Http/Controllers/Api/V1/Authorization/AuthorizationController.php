<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Support\PermissionRegistry;
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
    ) {}

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
        $tenantId = $this->snapshotTenant($actor);

        /*
         * Building this snapshot resolves every permission through the full
         * engine — hundreds of decide() calls, each firing several queries — so
         * an uncached rebuild on every page load is the single largest cost in
         * the login/restore path. It is cached per user, keyed by the
         * authorization cache version, so any role/permission/flag/grant change
         * (which invalidates that version) busts it immediately; a per-user key
         * also keeps one actor's grants out of someone else's snapshot. See
         * AuthorizationCache for the invalidation contract.
         */
        $payload = $this->cache->remember(
            'snapshot:user:'.$actor->id,
            $tenantId,
            fn () => $this->buildSnapshot($actor, $tenantId),
            300
        );

        return response()->json(['success' => true, 'data' => $payload]);
    }

    /**
     * The permission snapshot for a single user.
     *
     * Extracted from me() so the engine work sits inside the cache closure.
     */
    private function buildSnapshot(User $actor, ?string $tenantId): array
    {
        $permissions = Permission::query()
            ->when(
                SchemaSupport::hasColumn('permissions', 'is_active'),
                fn ($q) => $q->where('is_active', true)
            )
            ->orderBy(SchemaSupport::hasColumn('permissions', 'code') ? 'code' : 'name')
            ->limit(1000)
            ->get();
        $decisions = [];
        $shadow = $this->flags->enabled('authorization_shadow_mode', $tenantId, true);
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
                'shadowFallback' => ! $decision->allowed && $shadow && ($decision->legacyDecision['allowed'] ?? false),
            ];
        }

        return [
            'authorizationVersion' => 'v2',
            'cacheVersion' => $this->cache->version($tenantId),
            'permissions' => $decisions,
            'requires' => $this->chainSnapshot(),
            'roles' => $this->roleSnapshot($actor),
            'featureFlags' => $this->flagSnapshot($actor->company_code),
        ];
    }

    /**
     * Business code → the codes its ancestors require.
     *
     * The Permission Matrix suppresses a child whose module or page is denied,
     * but the browser's can() was a flat lookup: a role holding
     * hr.appointment.create while ui.forms was denied got `true` and rendered
     * the button, even though the matrix showed the action as effectively
     * denied. That is a child bypassing a denied parent — the one thing the
     * hierarchy exists to prevent.
     *
     * Publishing the chain lets the client apply the same rule the server does,
     * from the same registry, instead of re-deriving a hierarchy it cannot see.
     * The middleware still decides every request; this only stops the UI from
     * offering an action the API would refuse.
     *
     * @return array<string,list<string>>
     */
    private function chainSnapshot(): array
    {
        $out = [];

        foreach (PermissionRegistry::all() as $key => $node) {
            $required = PermissionRegistry::requiredCodesFor($key);

            foreach (PermissionRegistry::impliedCodes($key) as $code) {
                // A code reached through several nodes keeps the shortest chain:
                // holding it by any legitimate route is enough.
                if (! isset($out[$code]) || count($required) < count($out[$code])) {
                    $out[$code] = array_values(array_diff($required, [$code]));
                }
            }
        }

        return array_filter($out);
    }

    /**
     * The cache tenant for the snapshot.
     *
     * A super-admin style account usually has a null / "all-companies"
     * company_code. Collapsing those onto the global cache key means any
     * authorization invalidation — which always bumps the global version —
     * busts their snapshot, so a system-role change is never served stale.
     */
    private function snapshotTenant(User $actor): ?string
    {
        $code = trim((string) $actor->company_code);

        return in_array($code, ['', 'all-companies', 'all'], true) ? null : $code;
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
    /**
     * Both assignment records, merged and de-duplicated by role.
     *
     * The enterprise table was preferred and user_roles consulted only when it
     * was absent — but User::roles() is a belongsToMany on user_roles, so that
     * pivot is what every authorization check resolves. Where the two disagree
     * the snapshot silently under-reported: the super administrator holds role 1
     * through user_roles with no active enterprise assignment, so their own
     * snapshot came back with an empty roles array while they held a role.
     *
     * Enterprise rows are read first because they carry scope and validity;
     * pivot-only roles are appended with those fields null, which is honest —
     * the pivot does not record them.
     */
    private function roleSnapshot(User $actor): array
    {
        $byCode = [];

        if (SchemaSupport::hasTable('authorization_role_assignments')) {
            foreach ($actor->authorizationRoleAssignments()->active()->with('role:id,name,code,role_type')->get() as $assignment) {
                $code = $assignment->role?->code;

                if ($code === null) {
                    continue;
                }

                $byCode[$code] = [
                    'code' => $code, 'name' => $assignment->role?->name,
                    'type' => $assignment->role?->role_type, 'scopeType' => $assignment->scope_type,
                    'scopeId' => $assignment->scope_id, 'validUntil' => $assignment->valid_until,
                ];
            }
        }

        foreach ($actor->roles()->get() as $role) {
            $code = $role->code ?: Str::slug($role->name, '_');

            // An enterprise row already describes this role with its scope, and
            // that is the richer record — do not overwrite it with nulls.
            if (isset($byCode[$code])) {
                continue;
            }

            $byCode[$code] = [
                'code' => $code, 'name' => $role->name,
                'type' => $role->role_type ?? $role->type, 'scopeType' => null,
                'scopeId' => null, 'validUntil' => null,
            ];
        }

        return array_values($byCode);
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
