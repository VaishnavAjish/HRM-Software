<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\Matrix\EffectiveStateResolver;
use App\Services\Authorization\Matrix\PermissionValidator;
use App\Services\Authorization\Matrix\RoleMatrixBuilder;
use App\Services\Authorization\Matrix\RoleMatrixWriter;
use App\Services\Authorization\SchemaSupport;
use App\Support\PermissionRegistry;
use App\Support\RoleAudit;
use App\Support\RoleHierarchy;
use App\Support\SystemRoles;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use RuntimeException;

/**
 * The administration surface behind the Permission Matrix screen.
 *
 * Every write here changes who can do what, so all of them are audited to
 * authorization_permission_audit_logs with the previous and new state — that
 * table, not the decision log, is what answers "who granted this and what was
 * it before".
 */
class PermissionMatrixController extends Controller
{
    public function __construct(
        private readonly RoleMatrixBuilder $matrix,
        private readonly RoleMatrixWriter $writer,
        private readonly PermissionValidator $validator,
        private readonly AuthorizationEngine $authorization,
        private readonly AuthorizationCache $cache,
    ) {
    }

    /** Roles for the selector. The protected identity is never listed. */
    public function roles(Request $request)
    {
        $roles = SystemRoles::exclude(Role::query())
            ->when($request->filled('search'), fn ($q) => $q->where(function ($inner) use ($request) {
                $term = '%' . $request->string('search') . '%';
                $inner->where('name', 'like', $term)->orWhere('code', 'like', $term);
            }))
            ->orderBy('name')
            ->get()
            ->map(fn (Role $role) => [
                'id' => $role->id,
                'name' => $role->name,
                'code' => $role->code,
                'roleType' => $role->role_type,
                'isSystem' => (bool) $role->is_system,
                'isSensitive' => (bool) $role->is_sensitive,
                'isAssignable' => (bool) $role->is_assignable,
                'status' => $role->status,
                'version' => (int) ($role->version ?? 1),
                'manageable' => RoleHierarchy::canManage(auth('api')->user(), $role),
            ]);

        return response()->json(['success' => true, 'data' => $roles]);
    }

    public function show(Role $role)
    {
        if ($denied = $this->denyUnlessManageable($role, readOnly: true)) {
            return $denied;
        }

        $data = $this->matrix->build($role);
        $data['editable'] = RoleHierarchy::canManage(auth('api')->user(), $role)
            && (! $role->is_system || $this->actorIsGlobal());
        $data['validation'] = $this->validator->all();
        $data['apiSurface'] = $this->apiSurface($data['tree']);

        return response()->json(['success' => true, 'data' => $data]);
    }

    /**
     * Apply matrix edits.
     *
     * `roleVersion` is the version the client loaded. A mismatch means another
     * administrator saved in the meantime, and the save is refused rather than
     * silently overwriting their change.
     */
    public function update(Request $request, Role $role)
    {
        if ($denied = $this->denyUnlessManageable($role)) {
            return $denied;
        }

        $data = $request->validate([
            'changes' => ['required', 'array', 'min:1', 'max:1000'],
            'changes.*.permissionCode' => ['required', 'string', 'max:190'],
            'changes.*.state' => ['required', Rule::in(EffectiveStateResolver::SETTABLE)],
            'changes.*.conditions' => ['nullable', 'array'],
            'businessReason' => ['nullable', 'string', 'max:500'],
            'roleVersion' => ['nullable', 'integer'],
        ]);

        if ($role->is_system && ! $this->actorIsGlobal()) {
            return $this->error('PERMISSION_DENIED', 'System roles can only be edited by a global administrator.', 403);
        }

        try {
            $result = $this->writer->apply(
                $role,
                $data['changes'],
                $data['businessReason'] ?? null,
                $data['roleVersion'] ?? null,
                (int) auth('api')->id(),
            );
        } catch (RuntimeException $exception) {
            return $this->translateWriteFailure($exception);
        }

        $this->cache->invalidate($role->tenant_id ?? null);

        return response()->json([
            'success' => true,
            'data' => array_merge($result, ['matrix' => $this->matrix->build($role->fresh())]),
        ]);
    }

    /**
     * Clone a role's permission configuration.
     *
     * Assignments are deliberately not copied: a clone is a starting point for a
     * new role, and duplicating the user list would grant a freshly-made role to
     * people nobody assigned it to.
     */
    public function clone(Request $request, Role $role)
    {
        if ($denied = $this->denyUnlessManageable($role)) {
            return $denied;
        }

        $data = $request->validate([
            'name' => ['required', 'string', 'max:190', Rule::unique('roles', 'name')],
            'code' => ['nullable', 'string', 'max:190', Rule::unique('roles', 'code')],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        if (! RoleHierarchy::canCreateRoleClass(auth('api')->user(), RoleHierarchy::classOf($role))) {
            RoleAudit::denied(request(), auth('api')->user(), 'ROLE_CLONE_FORBIDDEN', $role);

            return $this->error('ROLE_MANAGEMENT_FORBIDDEN', 'You may not create a role at this level.', 403);
        }

        $clone = DB::transaction(function () use ($data, $role) {
            $attributes = ['name' => $data['name'], 'type' => 'Custom', 'is_active' => true];

            foreach ([
                'code' => $data['code'] ?? Str::slug($data['name'], '_'),
                'description' => $data['description'] ?? null,
                'role_type' => $role->role_type,
                'tenant_id' => $role->tenant_id,
                'is_system' => false,
                'is_assignable' => true,
                'is_sensitive' => $role->is_sensitive,
                'requires_approval' => $role->requires_approval,
                'default_scope_type' => $role->default_scope_type,
                'status' => 'ACTIVE',
                'version' => 1,
                'created_by' => auth('api')->id(),
            ] as $column => $value) {
                if (SchemaSupport::hasColumn('roles', $column)) {
                    $attributes[$column] = $value;
                }
            }

            $clone = Role::create($attributes);

            $rows = DB::table('role_permissions')->where('role_id', $role->id)->get();

            foreach ($rows as $row) {
                $copy = (array) $row;
                $copy['role_id'] = $clone->id;
                DB::table('role_permissions')->insert($copy);
            }

            $this->recordAudit('ROLE', (string) $clone->id, $clone->name, 'CREATE', [
                'clonedFromRoleId' => $role->id,
                'clonedFromRoleName' => $role->name,
                'permissionsCopied' => $rows->count(),
            ]);

            return $clone;
        });

        return response()->json([
            'success' => true,
            'data' => ['id' => $clone->id, 'name' => $clone->name, 'code' => $clone->code],
        ], 201);
    }

    /**
     * Run a decision through the production engine and explain it.
     *
     * This calls AuthorizationEngine::decide() — the same path a real request
     * takes. A simulator with its own evaluation logic would drift from the
     * engine and tell administrators a comfortable lie.
     */
    public function simulate(Request $request)
    {
        $data = $request->validate([
            'userId' => ['required', 'integer', 'exists:users,id'],
            'permissionCode' => ['required', 'string', 'max:190'],
            'companyScope' => ['nullable', 'string', 'max:100'],
            'resource' => ['nullable', 'array'],
            'context' => ['nullable', 'array'],
        ]);

        $subject = User::find($data['userId']);
        $started = hrtime(true);

        $resource = $data['resource'] ?? [];

        if (! empty($data['companyScope'])) {
            $resource['company_code'] = $data['companyScope'];
        }

        // Simulation must not pollute the decision log with events that never
        // happened; the engine honours audit=false.
        $decision = $this->authorization->decide(
            $subject,
            $data['permissionCode'],
            $resource,
            array_merge($data['context'] ?? [], ['audit' => false])
        );

        return response()->json([
            'success' => true,
            'data' => array_merge($decision->toArray(), [
                'decisionId' => (string) Str::uuid(),
                'subject' => ['id' => $subject->id, 'name' => $subject->name],
                'permissionCode' => $data['permissionCode'],
                'evaluationTimeMs' => round((hrtime(true) - $started) / 1_000_000, 2),
                'simulated' => true,
                'explanation' => $this->explain($subject, $data['permissionCode'], $decision),
            ]),
        ]);
    }

    /**
     * A safe evaluation trace for the "View Explanation" panel.
     *
     * Deliberately reports the shape of the decision — which stage produced it and
     * which ancestor blocked it — rather than dumping policy internals.
     */
    private function explain(User $subject, string $code, $decision): array
    {
        $roles = $subject->roles()->get(['roles.id', 'roles.name', 'roles.code']);
        $visibleRoles = $roles->reject(fn ($role) => SystemRoles::isProtected($role->code));

        $steps = [
            ['label' => 'User', 'value' => $subject->id . ' - ' . $subject->name],
            ['label' => 'Roles', 'value' => $visibleRoles->pluck('name')->implode(', ') ?: 'None'],
            ['label' => 'Permission', 'value' => $code],
        ];

        if ($subject->isSuperAdmin()) {
            $steps[] = ['label' => 'Protected hierarchy rule', 'value' => 'Super administrator bypass'];
        }

        foreach (array_reverse(PermissionRegistry::ancestorsOf($code)) as $ancestor) {
            $node = PermissionRegistry::node($ancestor);

            if ($node === null || $node['permission'] === null) {
                continue;
            }

            $steps[] = [
                'label' => 'Parent ' . $node['label'],
                'value' => $this->authorization->decide($subject, $ancestor, [], ['audit' => false])->allowed ? 'ALLOW' : 'DENY',
            ];
        }

        $steps[] = ['label' => 'Effective state', 'value' => $decision->effectiveState];
        $steps[] = ['label' => 'Conditional policy', 'value' => $decision->matchedPolicyIds ? 'Matched' : 'None'];
        $steps[] = ['label' => 'Failed conditions', 'value' => $decision->failedConditions ? implode(', ', $decision->failedConditions) : 'None'];

        return [
            'steps' => $steps,
            'finalDecision' => $decision->allowed ? 'ALLOW' : 'DENY',
            'reason' => $this->humanReason($decision),
        ];
    }

    private function humanReason($decision): string
    {
        return match ($decision->reasonCode) {
            'SUPER_ADMIN_BYPASS' => 'Protected system identity — unrestricted by design.',
            'EXPLICIT_DENY' => 'Denied due to explicit deny on this permission.',
            'EXPLICIT_ALLOW' => 'Permission granted by an assigned role.',
            'PERMISSION_NOT_ASSIGNED' => 'No role grants this permission, and the system denies by default.',
            'TENANT_ACCESS_DENIED' => 'Permission is not valid for the selected company.',
            'SUBJECT_DISABLED' => 'The user account is not active.',
            default => 'Denied by the authorization engine.',
        };
    }

    /** Recent configuration changes, for the Recent Changes panel. */
    public function audit(Request $request)
    {
        if (! SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return response()->json(['success' => true, 'data' => [], 'meta' => ['total' => 0]]);
        }

        $query = DB::table('authorization_permission_audit_logs as l')
            ->leftJoin('users as u', 'u.id', '=', 'l.actor_id')
            ->when($request->filled('subjectId'), fn ($q) => $q->where('l.subject_id', $request->string('subjectId')))
            ->orderByDesc('l.created_at');

        $total = (clone $query)->count();

        $rows = $query->limit(min((int) $request->input('limit', 20), 100))
            ->get([
                'l.event_id', 'l.subject_type', 'l.subject_id', 'l.subject_label',
                'l.change_type', 'l.permission_code', 'l.old_state', 'l.new_state',
                'l.business_reason', 'l.created_at', 'u.name as actor_name',
            ]);

        return response()->json([
            'success' => true,
            'data' => $rows->map(fn ($row) => [
                'eventId' => $row->event_id,
                'actorName' => $row->actor_name,
                'subjectLabel' => $row->subject_label,
                'changeType' => $row->change_type,
                'permissionCode' => $row->permission_code,
                'permissionLabel' => PermissionRegistry::node((string) $row->permission_code)['label'] ?? $row->permission_code,
                'oldState' => $row->old_state,
                'newState' => $row->new_state,
                'businessReason' => $row->business_reason,
                'changedAt' => $row->created_at,
            ]),
            'meta' => ['total' => $total],
        ]);
    }

    /** Registry-wide validation report, for the console and for CI. */
    public function validation()
    {
        $issues = $this->validator->all();

        return response()->json([
            'success' => true,
            'data' => $issues,
            'meta' => [
                'errors' => count(array_filter($issues, fn ($i) => $i['severity'] === PermissionValidator::SEVERITY_ERROR)),
                'warnings' => count(array_filter($issues, fn ($i) => $i['severity'] === PermissionValidator::SEVERITY_WARNING)),
            ],
        ]);
    }

    /** API capabilities grouped by the module and page that own them. */
    private function apiSurface(array $tree): array
    {
        $groups = [];

        $walk = function (array $nodes) use (&$walk, &$groups) {
            foreach ($nodes as $node) {
                foreach ($node['api'] as $endpoint) {
                    $module = PermissionRegistry::moduleOf($node['key']);
                    $page = PermissionRegistry::pageOf($node['key']);

                    $groups[$module][$page ?? $module][] = [
                        'method' => $endpoint['method'],
                        'path' => $endpoint['path'],
                        'permissionCode' => $node['permissionCode'],
                        'label' => $node['label'],
                        'sensitivity' => $node['sensitivity'],
                        'effectiveResult' => $node['effectiveResult'],
                        'protected' => $node['impliedCodes'] !== [],
                    ];
                }

                $walk($node['children']);
            }
        };

        $walk($tree);

        $out = [];

        foreach ($groups as $module => $pages) {
            $pageRows = [];

            foreach ($pages as $page => $endpoints) {
                $pageRows[] = [
                    'key' => $page,
                    'label' => PermissionRegistry::node((string) $page)['label'] ?? $page,
                    'endpoints' => $endpoints,
                ];
            }

            $out[] = [
                'key' => $module,
                'label' => PermissionRegistry::node((string) $module)['label'] ?? $module,
                'pages' => $pageRows,
            ];
        }

        return $out;
    }

    /**
     * Per-target authorisation for the matrix surface.
     *
     * The route middleware established only that the caller manages *some* tier.
     * Editing a role's permissions is editing what that role can do, so it needs
     * the same target check as editing the role itself — otherwise an
     * administrator blocked from updating the Admin role could grant itself
     * everything through the Admin role's matrix instead.
     *
     * The hidden identity answers 404 rather than 403: its existence is not
     * something this surface confirms.
     */
    private function denyUnlessManageable(Role $role, bool $readOnly = false): ?\Illuminate\Http\JsonResponse
    {
        $actor = auth('api')->user();

        if (SystemRoles::isProtected($role)) {
            RoleAudit::denied(request(), $actor, 'HIDDEN_ROLE_ACCESS_BLOCKED', $role);

            return response()->json([
                'success' => false,
                'error' => ['code' => 'NOT_FOUND', 'message' => 'Role not found.'],
            ], 404);
        }

        if ($readOnly || RoleHierarchy::canManage($actor, $role)) {
            return null;
        }

        RoleAudit::denied(request(), $actor, 'ROLE_MANAGEMENT_FORBIDDEN', $role);

        return response()->json([
            'success' => false,
            'code' => 'ROLE_MANAGEMENT_FORBIDDEN',
            'message' => 'You do not have permission to manage this role.',
        ], 403);
    }

    private function translateWriteFailure(RuntimeException $exception): \Illuminate\Http\JsonResponse
    {
        [$code, $detail] = array_pad(explode(':', $exception->getMessage(), 2), 2, '');

        return match ($code) {
            'VERSION_CONFLICT' => response()->json([
                'success' => false,
                'error' => [
                    'code' => 'VERSION_CONFLICT',
                    'message' => 'This role changed since you loaded it. Reload before saving.',
                    'currentVersion' => (int) $detail,
                ],
            ], 409),
            'CONDITION_REQUIRED' => response()->json([
                'success' => false,
                'error' => [
                    'code' => 'CONDITION_REQUIRED',
                    'message' => 'Conditional permissions need a condition before they can be saved.',
                    'details' => explode(',', $detail),
                ],
            ], 422),
            'UNKNOWN_PERMISSION_CODES' => response()->json([
                'success' => false,
                'error' => [
                    'code' => 'UNKNOWN_PERMISSION_CODES',
                    'message' => 'Unknown permission codes.',
                    'details' => explode(',', $detail),
                ],
            ], 422),
            'CATALOG_OUT_OF_SYNC' => response()->json([
                'success' => false,
                'error' => [
                    'code' => 'CATALOG_OUT_OF_SYNC',
                    'message' => 'The permission catalogue is behind the registry. Run authz:sync-catalog.',
                    'details' => explode(',', $detail),
                ],
            ], 409),
            default => $this->error('SAVE_FAILED', 'The permission changes could not be applied.', 500),
        };
    }

    private function error(string $code, string $message, int $status): \Illuminate\Http\JsonResponse
    {
        return response()->json(['success' => false, 'error' => compact('code', 'message')], $status);
    }

    private function actorIsGlobal(): bool
    {
        return (int) (auth('api')->user()?->role ?? -1) === 0;
    }

    private function recordAudit(string $subjectType, string $subjectId, string $label, string $changeType, array $values): void
    {
        if (! SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return;
        }

        DB::table('authorization_permission_audit_logs')->insert([
            'event_id' => (string) Str::uuid(),
            'tenant_id' => auth('api')->user()?->company_code ?: null,
            'actor_id' => auth('api')->id(),
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'subject_label' => $label,
            'change_type' => $changeType,
            'permission_code' => $values['permissionCode'] ?? null,
            'old_state' => $values['oldState'] ?? null,
            'new_state' => $values['newState'] ?? null,
            'new_values' => json_encode($values),
            'business_reason' => $values['businessReason'] ?? null,
            'request_id' => request()?->header('X-Request-Id'),
            'ip_address' => request()?->ip(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
