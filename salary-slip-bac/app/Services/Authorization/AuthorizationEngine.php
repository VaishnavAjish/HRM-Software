<?php

namespace App\Services\Authorization;

use App\Models\AuthorizationDecisionLog;
use App\Models\AuthorizationPolicy;
use App\Models\AuthorizationRoleAssignment;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class AuthorizationEngine
{
    public function __construct(
        private readonly ConditionEvaluator $conditions,
        private readonly ScopeMatcher $scopes,
        private readonly AuthorizationCache $cache,
        private readonly FeatureFlags $flags,
    ) {
    }

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

        if (!$this->isActive($actor)) {
            return $this->finish($actor, $permissionCode, $resourceData, new AuthorizationDecision(
                false, 'SUBJECT_DISABLED', effectiveState: 'DENY'
            ), $requestContext, $started);
        }

        if (!$this->scopes->tenantMatches($tenantId, $resourceTenant, $global)) {
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
            ->where('permissions.is_active', true)
            ->where(fn ($q) => $q->where('permissions.code', $permissionCode)->orWhere('permissions.name', $permissionCode))
            ->where(fn ($q) => $q->whereNull('user_permissions.valid_from')->orWhere('user_permissions.valid_from', '<=', $now))
            ->where(fn ($q) => $q->whereNull('user_permissions.valid_until')->orWhere('user_permissions.valid_until', '>', $now))
            ->select('permissions.id', 'permissions.code', 'user_permissions.is_denied', 'user_permissions.conditions', 'user_permissions.obligations')
            ->get();

        foreach ($direct as $grant) {
            $conditions = $this->json($grant->conditions);
            if ($this->conditions->evaluate($conditions, $context)) {
                $sources[] = [
                    'type' => 'USER_PERMISSION', 'id' => $grant->id,
                    'effect' => $grant->is_denied ? 'DENY' : 'ALLOW',
                    'conditions' => $conditions, 'obligations' => $this->json($grant->obligations),
                    'inherited' => false,
                ];
            }
        }

        foreach ($this->roleContexts($actor) as $roleContext) {
            if (!$global && !$this->scopes->matches(
                $roleContext['scope_type'], $roleContext['scope_id'], $context['subject'], $resource
            )) {
                continue;
            }
            foreach ($this->rolePermissionRows($roleContext['role_id'], $permissionCode, $roleContext['inherited']) as $grant) {
                $conditions = $this->json($grant->conditions);
                if ($this->conditions->evaluate($conditions, $context)) {
                    $sources[] = [
                        'type' => 'ROLE_PERMISSION', 'id' => $grant->permission_id,
                        'roleId' => $roleContext['role_id'], 'roleCode' => $roleContext['role_code'],
                        'effect' => strtoupper($grant->effect ?: 'ALLOW'),
                        'conditions' => $conditions, 'obligations' => $this->json($grant->obligations),
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
        $contexts = [];
        if (Schema::hasTable('authorization_role_assignments')) {
            $assignments = AuthorizationRoleAssignment::active()->with('role')->where('user_id', $actor->id)->get();
            foreach ($assignments as $assignment) {
                if (!$assignment->role || !$assignment->role->is_active || $assignment->role->status !== 'ACTIVE') {
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
        return $contexts;
    }

    private function rolePermissionRows(int $roleId, string $permissionCode, bool $inherited)
    {
        return DB::table('role_permissions')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('role_permissions.role_id', $roleId)
            ->where('permissions.is_active', true)
            ->when($inherited, fn ($q) => $q->where('role_permissions.inherit_to_children', true))
            ->where(function ($q) use ($permissionCode) {
                $q->where('permissions.code', $permissionCode)
                    ->orWhere('permissions.name', $permissionCode)
                    ->orWhere('permissions.code', '*');
                foreach ($this->wildcards($permissionCode) as $wildcard) {
                    $q->orWhere('permissions.code', $wildcard);
                }
            })
            ->where(fn ($q) => $q->whereNull('role_permissions.valid_from')->orWhere('role_permissions.valid_from', '<=', now()))
            ->where(fn ($q) => $q->whereNull('role_permissions.valid_until')->orWhere('role_permissions.valid_until', '>', now()))
            ->select(
                'permissions.id as permission_id', 'role_permissions.effect', 'role_permissions.conditions',
                'role_permissions.obligations'
            )->get();
    }

    private function matchingPolicies(
        User $actor,
        string $permissionCode,
        array $resource,
        array $context,
        ?string $tenantId,
        bool $global
    ): array {
        if (!Schema::hasTable('authorization_policies')) {
            return [];
        }
        $roleCodes = array_values(array_unique(array_column($this->roleContexts($actor), 'role_code')));
        $resourceType = $resource['resource_type'] ?? $this->permissionResource($permissionCode);
        $matched = [];
        $policies = AuthorizationPolicy::active()
            ->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $tenantId))
            ->orderByDesc('priority')->get();

        foreach ($policies as $policy) {
            if (!$this->listMatches($policy->actions, $permissionCode)) {
                continue;
            }
            if (!$this->listMatches($policy->resources, $resourceType)) {
                continue;
            }
            if (!$this->subjectMatches($policy->subjects, $actor, $roleCodes)) {
                continue;
            }
            if (!$global && !$this->scopes->matches($policy->scope_type, $policy->scope_id, $context['subject'], $resource)) {
                continue;
            }
            try {
                $this->conditions->validate($policy->conditions);
                if (!$this->conditions->evaluate($policy->conditions, $context)) {
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
            if (!Schema::hasTable($definition['table'])) {
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
                if (!$this->listMatches($codes, $permissionCode)) {
                    continue;
                }
                if (!$this->scopes->matches($row->scope_type, $row->scope_id, $context['subject'], $resource)) {
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
        if (!Schema::hasTable('authorization_relationships') || empty($resource['id'])) {
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
        if ($allowed && !$this->scopes->tenantMatches($actor->company_code, $this->scopes->tenant($resource), false)) {
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
        if (($context['audit'] ?? true) && Schema::hasTable('authorization_decision_logs')) {
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
        if ((int) $actor->role === 0) {
            return true;
        }
        if (!Schema::hasTable('authorization_role_assignments')) {
            return false;
        }
        return AuthorizationRoleAssignment::active()
            ->where('user_id', $actor->id)->where('scope_type', 'GLOBAL')
            ->whereHas('role', fn ($q) => $q->where('is_active', true)->where('status', 'ACTIVE'))
            ->exists();
    }

    private function isActive(User $actor): bool
    {
        return !$actor->is_deleted && in_array((string) $actor->status, ['0', 'ACTIVE'], true);
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
        if (!$subjects) {
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
        return collect($matches)->contains(fn ($match) => !empty($match['conditions']));
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
            $wildcards[] = implode('.', $parts) . '.*';
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
