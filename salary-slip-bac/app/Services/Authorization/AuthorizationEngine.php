<?php

namespace App\Services\Authorization;

use App\Models\AuthorizationDecisionLog;
use App\Models\AuthorizationPolicy;
use App\Models\AuthorizationRoleAssignment;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Support\PermissionRegistry;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

class AuthorizationEngine
{
    /** @var array<string,bool> Ancestor gate results, memoised for this request. */
    private array $gateCache = [];

    public function __construct(
        private readonly ConditionEvaluator $conditions,
        private readonly ScopeMatcher $scopes,
        private readonly AuthorizationCache $cache,
        private readonly FeatureFlags $flags,
    ) {}

    /**
     * Per-request memoization.
     *
     * A single request (e.g. the permission snapshot builder that resolves every
     * permission for a user) can call decide() hundreds of times for the same
     * actor, and decide() itself recomputes the role graph on every branch that
     * needs it. These three values depend only on the actor and the read-only
     * RBAC tables, which cannot change within a request, so caching them here
     * once turns an O(permissions × roles × queries) snapshot into the same work
     * the single role graph already did.
     */
    private array $roleContextCache = [];

    private array $globalActorCache = [];

    private array $policiesCache = [];

    public function decide(
        User $actor,
        string $permissionCode,
        array|Model|null $resource = null,
        array $requestContext = []
    ): AuthorizationDecision {
        $started = hrtime(true);
        $resourceData = $this->resourceArray($resource, $requestContext);
        $subject = $this->subjectArray($actor);
        $tenantId = $subject['company_code'] ?: null;
        $resourceTenant = $this->scopes->tenant($resourceData);
        $global = $this->isGlobalActor($actor);

        if (! $this->isActive($actor)) {
            return $this->finish($actor, $permissionCode, $resourceData, new AuthorizationDecision(
                false, 'SUBJECT_DISABLED', effectiveState: 'DENY'
            ), $requestContext, $started);
        }

        // Super administrators bypass the whole evaluation: no role graph, no
        // policy scan, no scope match. The one check kept above is isActive() —
        // a deleted or disabled row is refused even here, though a super admin
        // cannot be deactivated. The decision is still recorded by finish(), so
        // the bypass is auditable rather than silent.
        if ($actor->isSuperAdmin()) {
            return $this->finish($actor, $permissionCode, $resourceData, new AuthorizationDecision(
                true, 'SUPER_ADMIN_BYPASS', effectiveState: 'ALLOW',
                legacyDecision: ['allowed' => true, 'reasonCode' => 'SUPER_ADMIN']
            ), $requestContext, $started);
        }

        if (! $this->scopes->tenantMatches($tenantId, $resourceTenant, $global)) {
            return $this->finish($actor, $permissionCode, $resourceData, new AuthorizationDecision(
                false, 'TENANT_ACCESS_DENIED', effectiveState: 'DENY'
            ), $requestContext, $started);
        }

        $context = [
            'subject' => $subject,
            'resource' => $resourceData,
            'environment' => $this->environment($requestContext),
            'action' => array_merge(['permission' => $permissionCode], $requestContext['action'] ?? []),
            'relationships' => $this->relationships($actor, $resourceData, $tenantId),
        ];

        $sources = $this->permissionSources($actor, $permissionCode, $resourceData, $context, $global);
        $policies = $this->matchingPolicies($actor, $permissionCode, $resourceData, $context, $tenantId, $global);

        $denySources = array_values(array_filter($sources, fn ($source) => $source['effect'] === 'DENY'));
        $denyPolicies = array_values(array_filter($policies, fn ($policy) => $policy['effect'] === 'DENY'));
        $allowSources = array_values(array_filter($sources, fn ($source) => $source['effect'] === 'ALLOW'));
        $allowPolicies = array_values(array_filter($policies, fn ($policy) => $policy['effect'] === 'ALLOW'));

        if ($denySources || $denyPolicies) {
            $decision = new AuthorizationDecision(
                false,
                'EXPLICIT_DENY',
                array_column($denyPolicies, 'id'),
                array_values(array_merge($denySources, $denyPolicies)),
                $this->mergeObligations(array_merge($denySources, $denyPolicies)),
                effectiveState: $this->inheritedOnly($denySources) ? 'INHERITED_DENY' : 'DENY',
            );
        } elseif ($allowSources || $allowPolicies) {
            $matches = array_merge($allowSources, $allowPolicies);
            $decision = new AuthorizationDecision(
                true,
                'EXPLICIT_ALLOW',
                array_column($allowPolicies, 'id'),
                array_values($matches),
                $this->mergeObligations($matches),
                effectiveState: $this->conditional($matches)
                    ? 'CONDITIONAL'
                    : ($this->inheritedOnly($allowSources) ? 'INHERITED_ALLOW' : 'ALLOW'),
            );
        } else {
            $decision = new AuthorizationDecision(false, 'PERMISSION_NOT_ASSIGNED', effectiveState: 'NOT_ASSIGNED');
        }

        /*
         * A grant only holds while the resource above it does.
         *
         * The engine resolved each code on its own, so a role holding
         * ui.portals.employee_dashboard was allowed it even though ui.portals —
         * the module that contains it — was denied. The Permission Matrix showed
         * that child as effectively DENY and the browser refused it, so the two
         * disagreed with the thing that actually authorises requests.
         *
         * The ancestor chain comes from PermissionRegistry, the same source the
         * matrix resolves against and the same one the client's requires chain is
         * published from, so all three now derive the hierarchy from one place
         * instead of two of them compensating for this one.
         *
         * Configuration is untouched: the grant stays on the role and becomes
         * effective again the moment its parent is allowed.
         */
        if ($decision->allowed) {
            $blockedBy = $this->deniedAncestor($actor, $permissionCode, $resourceData, $context, $tenantId, $global);

            if ($blockedBy !== null) {
                $decision = new AuthorizationDecision(
                    false,
                    'PARENT_DENIED',
                    $decision->matchedPolicyIds,
                    $decision->sources,
                    [],
                    $decision->failedConditions,
                    'DENY',
                );
            }
        }

        $legacy = $this->legacyDecision($actor, $permissionCode, $resourceData);
        $decision = new AuthorizationDecision(
            $decision->allowed,
            $decision->reasonCode,
            $decision->matchedPolicyIds,
            $decision->sources,
            $decision->obligations,
            $decision->failedConditions,
            $decision->effectiveState,
            $legacy,
        );

        return $this->finish($actor, $permissionCode, $resourceData, $decision, $requestContext, $started);
    }

    public function legacyAllows(User $actor, string $permissionCode, array|Model|null $resource = null): bool
    {
        return $this->legacyDecision($actor, $permissionCode, $this->resourceArray($resource, []))['allowed'];
    }

    /**
     * The nearest ancestor of this permission that the actor does not hold.
     *
     * Only registry codes have a hierarchy. A business code such as
     * hr.attendance.read is enforced directly by route middleware and has no
     * parent to consult, so it is returned unchanged.
     *
     * Grouping rows carry no permission record of their own — they exist to
     * organise the tree — so they are stepped over rather than treated as a gate
     * nobody can satisfy.
     */
    private function deniedAncestor(
        User $actor,
        string $permissionCode,
        array $resource,
        array $context,
        ?string $tenantId,
        bool $global
    ): ?string {
        if (! PermissionRegistry::has($permissionCode)) {
            return null;
        }

        foreach (PermissionRegistry::requiredCodesFor($permissionCode) as $ancestor) {
            if ($ancestor === $permissionCode) {
                continue;
            }

            if (PermissionRegistry::node($ancestor)['permission'] === null) {
                continue;
            }

            if (! $this->holdsDirectly($actor, $ancestor, $resource, $context, $tenantId, $global)) {
                return $ancestor;
            }
        }

        return null;
    }

    /**
     * Whether the actor holds this code on its own terms.
     *
     * Deliberately not decide(): the ancestors of a chain are themselves walked
     * by their own gate check, so recursing through the full path would re-walk
     * the same chain once per level and log a decision for every node the caller
     * never asked about. This resolves the same sources and policies decide()
     * does and answers only the question the gate needs.
     *
     * Memoised per actor, code and tenant for the life of the request. Building
     * one user's snapshot resolves several hundred permissions whose chains
     * overlap heavily, and without this each one would re-query the same handful
     * of modules.
     */
    private function holdsDirectly(
        User $actor,
        string $permissionCode,
        array $resource,
        array $context,
        ?string $tenantId,
        bool $global
    ): bool {
        $key = $actor->id.'|'.$permissionCode.'|'.($tenantId ?? '-').'|'.($resource['resource_type'] ?? '-');

        if (array_key_exists($key, $this->gateCache)) {
            return $this->gateCache[$key];
        }

        $sources = $this->permissionSources($actor, $permissionCode, $resource, $context, $global);
        $policies = $this->matchingPolicies($actor, $permissionCode, $resource, $context, $tenantId, $global);

        $denied = array_filter(
            array_merge($sources, $policies),
            fn ($row) => $row['effect'] === 'DENY'
        );

        if ($denied !== []) {
            return $this->gateCache[$key] = false;
        }

        $allowed = array_filter(
            array_merge($sources, $policies),
            fn ($row) => $row['effect'] === 'ALLOW'
        );

        return $this->gateCache[$key] = $allowed !== [];
    }

    private function permissionSources(
        User $actor,
        string $permissionCode,
        array $resource,
        array $context,
        bool $global
    ): array {
        $sources = [];
        $now = now();

        $direct = DB::table('user_permissions')
            ->join('permissions', 'permissions.id', '=', 'user_permissions.permission_id')
            ->where('user_permissions.user_id', $actor->id)
            ->tap(fn ($q) => $this->whereActivePermission($q))
            ->tap(fn ($q) => $this->wherePermissionCode($q, $permissionCode))
            ->tap(fn ($q) => $this->whereValid($q, 'user_permissions', $now))
            ->select(array_merge(
                ['permissions.id', 'user_permissions.is_denied'],
                array_map(
                    fn (string $c) => 'permissions.'.$c,
                    SchemaSupport::present('permissions', ['code'])
                ),
                array_map(
                    fn (string $c) => 'user_permissions.'.$c,
                    SchemaSupport::present('user_permissions', ['conditions', 'obligations'])
                )
            ))
            ->get();

        foreach ($direct as $grant) {
            $conditions = $this->json($grant->conditions ?? null);
            if ($this->conditions->evaluate($conditions, $context)) {
                $sources[] = [
                    'type' => 'USER_PERMISSION', 'id' => $grant->id,
                    'effect' => $grant->is_denied ? 'DENY' : 'ALLOW',
                    'conditions' => $conditions, 'obligations' => $this->json($grant->obligations ?? null),
                    'inherited' => false,
                ];
            }
        }

        foreach ($this->roleContexts($actor) as $roleContext) {
            if (! $global && ! $this->scopes->matches(
                $roleContext['scope_type'], $roleContext['scope_id'], $context['subject'], $resource
            )) {
                continue;
            }
            foreach ($this->rolePermissionRows($roleContext['role_id'], $permissionCode, $roleContext['inherited']) as $grant) {
                $conditions = $this->json($grant->conditions ?? null);
                if ($this->conditions->evaluate($conditions, $context)) {
                    $sources[] = [
                        'type' => 'ROLE_PERMISSION', 'id' => $grant->permission_id,
                        'roleId' => $roleContext['role_id'], 'roleCode' => $roleContext['role_code'],
                        'effect' => strtoupper(($grant->effect ?? null) ?: 'ALLOW'),
                        'conditions' => $conditions, 'obligations' => $this->json($grant->obligations ?? null),
                        'scopeType' => $roleContext['scope_type'], 'scopeId' => $roleContext['scope_id'],
                        'inherited' => $roleContext['inherited'],
                    ];
                }
            }
        }

        foreach ($this->temporarySources($actor, $permissionCode, $context, $resource) as $source) {
            $sources[] = $source;
        }

        return $sources;
    }

    private function roleContexts(User $actor): array
    {
        $key = $actor->id;
        if (isset($this->roleContextCache[$key])) {
            return $this->roleContextCache[$key];
        }

        $contexts = [];
        if (SchemaSupport::hasTable('authorization_role_assignments')) {
            $assignments = AuthorizationRoleAssignment::active()->with('role')->where('user_id', $actor->id)->get();
            foreach ($assignments as $assignment) {
                if (! $assignment->role || ! $assignment->role->is_active || $assignment->role->status !== 'ACTIVE') {
                    continue;
                }
                $contexts[] = [
                    'role_id' => $assignment->role_id, 'role_code' => $assignment->role->code,
                    'scope_type' => $assignment->scope_type, 'scope_id' => $assignment->scope_id,
                    'inherited' => false,
                ];
            }
        }

        foreach ($actor->roles()->where('is_active', true)->get() as $role) {
            if (collect($contexts)->contains(fn ($row) => $row['role_id'] === $role->id)) {
                continue;
            }
            $contexts[] = [
                'role_id' => $role->id, 'role_code' => $role->code ?: Str::slug($role->name, '_'),
                'scope_type' => ((int) $actor->role === 0 || $role->code === 'super_administrator') ? 'GLOBAL' : 'TENANT',
                'scope_id' => ((int) $actor->role === 0) ? null : $actor->company_code,
                'inherited' => false,
            ];
        }

        if (! SchemaSupport::hasTable('authorization_role_inheritances')) {
            return $this->roleContextCache[$key] = $contexts;
        }

        $queue = $contexts;
        $visited = array_fill_keys(array_column($contexts, 'role_id'), true);
        $depth = 0;
        while ($queue && $depth++ < 8) {
            $next = [];
            foreach ($queue as $child) {
                $parents = DB::table('authorization_role_inheritances')
                    ->join('roles', 'roles.id', '=', 'authorization_role_inheritances.parent_role_id')
                    ->where('child_role_id', $child['role_id'])
                    ->where('roles.is_active', true)
                    ->select('roles.id', 'roles.code')
                    ->get();
                foreach ($parents as $parent) {
                    if (isset($visited[$parent->id])) {
                        continue;
                    }
                    $visited[$parent->id] = true;
                    $row = [
                        'role_id' => $parent->id, 'role_code' => $parent->code,
                        'scope_type' => $child['scope_type'], 'scope_id' => $child['scope_id'],
                        'inherited' => true,
                    ];
                    $contexts[] = $row;
                    $next[] = $row;
                }
            }
            $queue = $next;
        }

        return $this->roleContextCache[$key] = $contexts;
    }

    private function rolePermissionRows(int $roleId, string $permissionCode, bool $inherited)
    {
        return DB::table('role_permissions')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('role_permissions.role_id', $roleId)
            ->tap(fn ($q) => $this->whereActivePermission($q))
            ->when(
                $inherited && SchemaSupport::hasColumn('role_permissions', 'inherit_to_children'),
                fn ($q) => $q->where('role_permissions.inherit_to_children', true)
            )
            ->tap(fn ($q) => $this->wherePermissionCode($q, $permissionCode, true))
            ->tap(fn ($q) => $this->whereValid($q, 'role_permissions', now()))
            ->select(array_merge(
                ['permissions.id as permission_id'],
                array_map(
                    fn (string $c) => 'role_permissions.'.$c,
                    SchemaSupport::present('role_permissions', ['effect', 'conditions', 'obligations'])
                )
            ))->get();
    }

    /**
     * Restrict to enabled permissions. Pre-enterprise schemas have no is_active
     * column, where every row is implicitly active.
     */
    private function whereActivePermission($query): void
    {
        if (SchemaSupport::hasColumn('permissions', 'is_active')) {
            $query->where('permissions.is_active', true);
        }
    }

    /**
     * Match a permission by code, falling back to name where the enterprise
     * permissions.code column is absent. Wildcard rows ('*' and the dotted
     * prefixes) only exist in code form, so they are skipped on thin schemas.
     */
    private function wherePermissionCode($query, string $permissionCode, bool $allowWildcards = false): void
    {
        if (! SchemaSupport::hasColumn('permissions', 'code')) {
            $query->where('permissions.name', $permissionCode);

            return;
        }

        $query->where(function ($q) use ($permissionCode, $allowWildcards) {
            $q->where('permissions.code', $permissionCode)
                ->orWhere('permissions.name', $permissionCode);
            if (! $allowWildcards) {
                return;
            }
            $q->orWhere('permissions.code', '*');
            foreach ($this->wildcards($permissionCode) as $wildcard) {
                $q->orWhere('permissions.code', $wildcard);
            }
        });
    }

    /**
     * Apply the valid_from/valid_until window when the grant table carries one.
     */
    private function whereValid($query, string $table, $now): void
    {
        if (SchemaSupport::hasColumn($table, 'valid_from')) {
            $query->where(fn ($q) => $q->whereNull($table.'.valid_from')->orWhere($table.'.valid_from', '<=', $now));
        }
        if (SchemaSupport::hasColumn($table, 'valid_until')) {
            $query->where(fn ($q) => $q->whereNull($table.'.valid_until')->orWhere($table.'.valid_until', '>', $now));
        }
    }

    private function matchingPolicies(
        User $actor,
        string $permissionCode,
        array $resource,
        array $context,
        ?string $tenantId,
        bool $global
    ): array {
        if (! SchemaSupport::hasTable('authorization_policies')) {
            return [];
        }
        $roleCodes = array_values(array_unique(array_column($this->roleContexts($actor), 'role_code')));
        $resourceType = $resource['resource_type'] ?? $this->permissionResource($permissionCode);
        $matched = [];
        $policyKey = $tenantId ?: 'global';
        if (! isset($this->policiesCache[$policyKey])) {
            $this->policiesCache[$policyKey] = AuthorizationPolicy::active()
                ->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $tenantId))
                ->orderByDesc('priority')->get();
        }
        $policies = $this->policiesCache[$policyKey];

        foreach ($policies as $policy) {
            if (! $this->listMatches($policy->actions, $permissionCode)) {
                continue;
            }
            if (! $this->listMatches($policy->resources, $resourceType)) {
                continue;
            }
            if (! $this->subjectMatches($policy->subjects, $actor, $roleCodes)) {
                continue;
            }
            if (! $global && ! $this->scopes->matches($policy->scope_type, $policy->scope_id, $context['subject'], $resource)) {
                continue;
            }
            try {
                $this->conditions->validate($policy->conditions);
                if (! $this->conditions->evaluate($policy->conditions, $context)) {
                    continue;
                }
            } catch (Throwable) {
                continue;
            }
            $matched[] = [
                'type' => 'POLICY', 'id' => $policy->id, 'code' => $policy->code,
                'effect' => strtoupper($policy->effect), 'conditions' => $policy->conditions,
                'obligations' => $policy->obligations ?: [], 'priority' => $policy->priority,
                'inherited' => false,
            ];
        }

        return $matched;
    }

    private function temporarySources(User $actor, string $permissionCode, array $context, array $resource): array
    {
        $sources = [];
        foreach ([
            ['table' => 'authorization_delegations', 'user_column' => 'delegate_id', 'type' => 'DELEGATION'],
            ['table' => 'authorization_emergency_grants', 'user_column' => 'user_id', 'type' => 'EMERGENCY_ACCESS'],
        ] as $definition) {
            if (! SchemaSupport::hasTable($definition['table'])) {
                continue;
            }
            $rows = DB::table($definition['table'])
                ->where($definition['user_column'], $actor->id)
                ->where('status', 'ACTIVE')
                ->where('valid_from', '<=', now())
                ->where('valid_until', '>', now())
                ->get();
            foreach ($rows as $row) {
                $codes = $this->json($row->permission_codes) ?: [];
                if (! $this->listMatches($codes, $permissionCode)) {
                    continue;
                }
                if (! $this->scopes->matches($row->scope_type, $row->scope_id, $context['subject'], $resource)) {
                    continue;
                }
                $sources[] = [
                    'type' => $definition['type'], 'id' => $row->id, 'effect' => 'ALLOW',
                    'conditions' => null, 'obligations' => ['auditRequired' => true], 'inherited' => false,
                ];
            }
        }

        return $sources;
    }

    private function relationships(User $actor, array $resource, ?string $tenantId): array
    {
        if (! SchemaSupport::hasTable('authorization_relationships') || empty($resource['id'])) {
            return [];
        }

        return DB::table('authorization_relationships')
            ->where('subject_type', 'user')->where('subject_id', (string) $actor->id)
            ->where('resource_type', $resource['resource_type'] ?? 'record')
            ->where('resource_id', (string) $resource['id'])
            ->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $tenantId))
            ->where(fn ($q) => $q->whereNull('valid_from')->orWhere('valid_from', '<=', now()))
            ->where(fn ($q) => $q->whereNull('valid_until')->orWhere('valid_until', '>', now()))
            ->pluck('relationship')->all();
    }

    private function legacyDecision(User $actor, string $permissionCode, array $resource): array
    {
        if ((int) $actor->role === 0) {
            return ['allowed' => true, 'reasonCode' => 'LEGACY_SUPER_ADMIN'];
        }
        if (str_starts_with($permissionCode, 'admin.authorization.')) {
            return ['allowed' => false, 'reasonCode' => 'LEGACY_SECURITY_ADMIN_REQUIRED'];
        }
        $role = $this->legacyRole($actor);
        $allowed = match ($role) {
            'admin' => true,
            'agent' => Str::startsWith($permissionCode, ['recruitment.', 'hr.appointment.', 'document.']),
            'employee' => Str::startsWith($permissionCode, ['self.', 'payroll.payslip.read', 'hr.profile.']),
            default => false,
        };
        if ($allowed && ! $this->scopes->tenantMatches($actor->company_code, $this->scopes->tenant($resource), false)) {
            $allowed = false;
        }

        return ['allowed' => $allowed, 'reasonCode' => $allowed ? 'LEGACY_ROLE_ALLOW' : 'LEGACY_DEFAULT_DENY'];
    }

    private function finish(
        User $actor,
        string $permissionCode,
        array $resource,
        AuthorizationDecision $decision,
        array $context,
        int $started
    ): AuthorizationDecision {
        if (($context['audit'] ?? true) && SchemaSupport::hasTable('authorization_decision_logs')) {
            try {
                AuthorizationDecisionLog::create([
                    'decision_id' => (string) Str::uuid(),
                    'tenant_id' => $actor->company_code ?: null,
                    'user_id' => $actor->id,
                    'session_id' => request()?->header('X-Session-Id'),
                    'action' => $permissionCode,
                    'resource_type' => $resource['resource_type'] ?? $this->permissionResource($permissionCode),
                    'resource_id' => isset($resource['id']) ? (string) $resource['id'] : null,
                    'decision' => $decision->allowed ? 'ALLOW' : 'DENY',
                    'reason_code' => $decision->reasonCode,
                    'matched_policy_ids' => $decision->matchedPolicyIds,
                    'failed_conditions' => $decision->failedConditions,
                    'scope' => Arr::only($resource, ['tenant_id', 'company_code', 'branch_id', 'department', 'team_id']),
                    'obligations' => $decision->obligations,
                    'ip_address' => request()?->ip(),
                    'device' => substr((string) request()?->userAgent(), 0, 255),
                    'request_id' => request()?->header('X-Request-Id'),
                    'changed_fields' => array_values($context['action']['changed_fields'] ?? []),
                    'business_reason' => isset($context['business_reason']) ? substr((string) $context['business_reason'], 0, 255) : null,
                    'authorization_version' => 'v2',
                    'duration_ms' => max(0, (int) ((hrtime(true) - $started) / 1_000_000)),
                ]);
            } catch (Throwable $e) {
                report($e);
            }
        }

        return $decision;
    }

    private function isGlobalActor(User $actor): bool
    {
        if (isset($this->globalActorCache[$actor->id])) {
            return $this->globalActorCache[$actor->id];
        }

        if ((int) $actor->role === 0) {
            return $this->globalActorCache[$actor->id] = true;
        }
        if (! SchemaSupport::hasTable('authorization_role_assignments')) {
            return $this->globalActorCache[$actor->id] = false;
        }

        return $this->globalActorCache[$actor->id] = AuthorizationRoleAssignment::active()
            ->where('user_id', $actor->id)->where('scope_type', 'GLOBAL')
            ->whereHas('role', fn ($q) => $q->where('is_active', true)->where('status', 'ACTIVE'))
            ->exists();
    }

    private function isActive(User $actor): bool
    {
        return ! $actor->is_deleted && in_array((string) $actor->status, ['0', 'ACTIVE'], true);
    }

    private function subjectArray(User $actor): array
    {
        return array_merge($actor->toArray(), [
            'id' => $actor->id,
            'company_code' => $actor->company_code === 'all-companies' ? null : $actor->company_code,
            'legacy_role' => $this->legacyRole($actor),
        ]);
    }

    private function resourceArray(array|Model|null $resource, array $context): array
    {
        $data = $resource instanceof Model ? $resource->attributesToArray() : ($resource ?: []);
        if ($resource instanceof Model) {
            $data['resource_type'] ??= class_basename($resource);
            $data['id'] ??= $resource->getKey();
        }

        return array_merge($data, $context['resource'] ?? []);
    }

    private function environment(array $context): array
    {
        return array_merge([
            'current_time' => now()->toIso8601String(),
            'current_date' => now()->toDateString(),
            'ip_address' => request()?->ip(),
            'mfa_verified' => (bool) ($context['mfa_verified'] ?? false),
            'request_source' => request()?->header('X-Request-Source', 'WEB'),
        ], $context['environment'] ?? []);
    }

    private function listMatches(?array $patterns, string $value): bool
    {
        foreach ($patterns ?: [] as $pattern) {
            if ($pattern === '*' || $pattern === $value) {
                return true;
            }
            if (is_string($pattern) && str_ends_with($pattern, '.*') && str_starts_with($value, substr($pattern, 0, -1))) {
                return true;
            }
        }

        return false;
    }

    private function subjectMatches(?array $subjects, User $actor, array $roleCodes): bool
    {
        if (! $subjects) {
            return true;
        }
        if (in_array($actor->id, Arr::wrap($subjects['userIds'] ?? []), false)) {
            return true;
        }
        if (array_intersect($roleCodes, Arr::wrap($subjects['roleCodes'] ?? []))) {
            return true;
        }

        return in_array($this->legacyRole($actor), Arr::wrap($subjects['types'] ?? []), true);
    }

    private function mergeObligations(array $matches): array
    {
        $merged = [];
        foreach ($matches as $match) {
            foreach (($match['obligations'] ?? []) as $key => $value) {
                if (is_array($value)) {
                    $merged[$key] = array_values(array_unique(array_merge(Arr::wrap($merged[$key] ?? []), $value), SORT_REGULAR));
                } elseif (is_bool($value)) {
                    $merged[$key] = ($merged[$key] ?? false) || $value;
                } else {
                    $merged[$key] = $value;
                }
            }
        }

        return $merged;
    }

    private function conditional(array $matches): bool
    {
        return collect($matches)->contains(fn ($match) => ! empty($match['conditions']));
    }

    private function inheritedOnly(array $sources): bool
    {
        return $sources !== [] && collect($sources)->every(fn ($source) => (bool) ($source['inherited'] ?? false));
    }

    private function wildcards(string $permissionCode): array
    {
        $parts = explode('.', $permissionCode);
        $wildcards = [];
        while (count($parts) > 1) {
            array_pop($parts);
            $wildcards[] = implode('.', $parts).'.*';
        }

        return $wildcards;
    }

    private function permissionResource(string $code): string
    {
        $parts = explode('.', $code);
        array_pop($parts);

        return implode('.', $parts) ?: $code;
    }

    private function json(mixed $value): ?array
    {
        if ($value === null || $value === '') {
            return null;
        }

        return is_array($value) ? $value : json_decode((string) $value, true);
    }

    private function legacyRole(User $actor): string
    {
        if ($actor->type === 'agent' || (int) $actor->role === 4) {
            return 'agent';
        }
        if (in_array((int) $actor->role, [0, 1, 2], true) || strtolower((string) $actor->role) === 'admin') {
            return 'admin';
        }

        return 'employee';
    }
}
