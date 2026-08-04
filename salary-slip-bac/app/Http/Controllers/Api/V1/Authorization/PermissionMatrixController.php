<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\PermissionMatrixBuilder;
use App\Services\Authorization\SchemaSupport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

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
    /** States an administrator may set. Inherited states are computed, never stored. */
    private const SETTABLE_STATES = ['ALLOW', 'DENY', 'CONDITIONAL', 'NOT_ASSIGNED'];

    public function __construct(
        private readonly PermissionMatrixBuilder $matrix,
        private readonly AuthorizationEngine $authorization,
        private readonly AuthorizationCache $cache,
    ) {
    }

    /** Roles for the selector. */
    public function roles(Request $request)
    {
        $query = \App\Support\SystemRoles::exclude(Role::query())
            ->when($request->filled('search'), fn ($q) => $q->where(function ($inner) use ($request) {
                $term = '%' . $request->string('search') . '%';
                $inner->where('name', 'like', $term)->orWhere('code', 'like', $term);
            }))
            ->when(
                SchemaSupport::hasColumn('roles', 'tenant_id') && $request->filled('tenantId'),
                fn ($q) => $q->where('tenant_id', $request->string('tenantId'))
            )
            ->orderBy('name');

        $roles = $query->get()->map(fn (Role $role) => [
            'id' => $role->id,
            'name' => $role->name,
            'code' => $role->code,
            'roleType' => $role->role_type,
            'isSystem' => (bool) $role->is_system,
            'isSensitive' => (bool) $role->is_sensitive,
            'isAssignable' => (bool) $role->is_assignable,
            'isActive' => (bool) $role->is_active,
            'status' => $role->status,
            'permissionCount' => DB::table('role_permissions')->where('role_id', $role->id)->count(),
            'assignedUserCount' => SchemaSupport::hasTable('authorization_role_assignments')
                ? DB::table('authorization_role_assignments')
                    ->where('role_id', $role->id)->where('status', 'ACTIVE')->count()
                : DB::table('user_roles')->where('role_id', $role->id)->count(),
        ]);

        return response()->json(['success' => true, 'data' => $roles]);
    }

    public function show(Role $role)
    {
        return response()->json(['success' => true, 'data' => $this->matrix->build($role)]);
    }

    /**
     * Apply matrix edits.
     *
     * Only the cells the client sends are touched. The screen holds hundreds of
     * cells and sending the whole grid back would make one administrator's save
     * silently revert another's concurrent edit to a cell they never looked at.
     */
    public function update(Request $request, Role $role)
    {
        $data = $request->validate([
            'changes' => ['required', 'array', 'min:1', 'max:500'],
            'changes.*.permissionCode' => ['required', 'string', 'max:190'],
            'changes.*.state' => ['required', Rule::in(self::SETTABLE_STATES)],
            'changes.*.conditions' => ['nullable', 'array'],
            'businessReason' => ['nullable', 'string', 'max:500'],
        ]);

        if ($role->is_system && !$this->actorIsGlobal()) {
            return response()->json([
                'success' => false,
                'error' => ['code' => 'PERMISSION_DENIED', 'message' => 'System roles can only be edited by a global administrator.'],
            ], 403);
        }

        $permissions = DB::table('permissions')
            ->whereIn('name', array_column($data['changes'], 'permissionCode'))
            ->pluck('id', 'name');

        $unknown = array_values(array_diff(
            array_column($data['changes'], 'permissionCode'),
            $permissions->keys()->all()
        ));

        if ($unknown) {
            return response()->json([
                'success' => false,
                'error' => [
                    'code' => 'INVALID_POLICY_CONDITION',
                    'message' => 'Unknown permission codes.',
                    'details' => $unknown,
                ],
            ], 422);
        }

        $applied = 0;
        DB::transaction(function () use ($data, $role, $permissions, &$applied) {
            foreach ($data['changes'] as $change) {
                $permissionId = $permissions[$change['permissionCode']];
                $existing = DB::table('role_permissions')
                    ->where('role_id', $role->id)->where('permission_id', $permissionId)->first();

                $previous = $existing === null
                    ? 'NOT_ASSIGNED'
                    : (strtoupper($existing->effect ?? 'ALLOW') === 'DENY' ? 'DENY' : 'ALLOW');

                if ($change['state'] === 'NOT_ASSIGNED') {
                    if ($existing === null) {
                        continue;
                    }
                    DB::table('role_permissions')
                        ->where('role_id', $role->id)->where('permission_id', $permissionId)->delete();
                } else {
                    $payload = ['role_id' => $role->id, 'permission_id' => $permissionId];
                    if (SchemaSupport::hasColumn('role_permissions', 'effect')) {
                        $payload['effect'] = $change['state'] === 'DENY' ? 'DENY' : 'ALLOW';
                    }
                    if (SchemaSupport::hasColumn('role_permissions', 'conditions')) {
                        $payload['conditions'] = $change['state'] === 'CONDITIONAL'
                            ? json_encode($change['conditions'] ?? [])
                            : null;
                    }

                    $existing === null
                        ? DB::table('role_permissions')->insert($payload)
                        : DB::table('role_permissions')
                            ->where('role_id', $role->id)->where('permission_id', $permissionId)
                            ->update(array_diff_key($payload, ['role_id' => 1, 'permission_id' => 1]));
                }

                $this->recordAudit('MATRIX_CELL', (string) $role->id, $role->name, 'UPDATE', [
                    'permissionCode' => $change['permissionCode'],
                    'oldState' => $previous,
                    'newState' => $change['state'],
                    'businessReason' => $data['businessReason'] ?? null,
                ]);

                $applied++;
            }

            if (SchemaSupport::hasColumn('roles', 'version')) {
                DB::table('roles')->where('id', $role->id)->increment('version');
            }
        });

        // Bump the authorization cache version so no session keeps deciding
        // against the permissions this role had a moment ago.
        $this->cache->invalidate($role->tenant_id ?? null);

        return response()->json([
            'success' => true,
            'data' => ['applied' => $applied, 'matrix' => $this->matrix->build($role->fresh())],
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
        $data = $request->validate([
            'name' => ['required', 'string', 'max:190', Rule::unique('roles', 'name')],
            'code' => ['nullable', 'string', 'max:190', Rule::unique('roles', 'code')],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);

        $clone = DB::transaction(function () use ($data, $role) {
            $attributes = [
                'name' => $data['name'],
                'type' => 'Custom',
                'is_active' => true,
            ];
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
     * Run a decision through the production engine.
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
            'resource' => ['nullable', 'array'],
            'context' => ['nullable', 'array'],
        ]);

        $subject = \App\Models\User::find($data['userId']);
        $started = hrtime(true);

        // Simulation must not pollute the decision log with events that never
        // happened; the engine honours audit=false.
        $decision = $this->authorization->decide(
            $subject,
            $data['permissionCode'],
            $data['resource'] ?? [],
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
            ]),
        ]);
    }

    /** Recent configuration changes, for the Recent Changes panel. */
    public function audit(Request $request)
    {
        if (!SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return response()->json(['success' => true, 'data' => [], 'meta' => ['total' => 0]]);
        }

        $query = DB::table('authorization_permission_audit_logs as l')
            ->leftJoin('users as u', 'u.id', '=', 'l.actor_id')
            ->when($request->filled('subjectType'), fn ($q) => $q->where('l.subject_type', $request->string('subjectType')))
            ->when($request->filled('subjectId'), fn ($q) => $q->where('l.subject_id', $request->string('subjectId')))
            ->orderByDesc('l.created_at');

        $total = (clone $query)->count();
        $rows = $query->limit(min((int) $request->input('limit', 20), 100))
            ->get([
                'l.event_id', 'l.subject_type', 'l.subject_id', 'l.subject_label',
                'l.change_type', 'l.permission_code', 'l.old_state', 'l.new_state',
                'l.new_values', 'l.business_reason', 'l.created_at', 'u.name as actor_name',
            ]);

        return response()->json([
            'success' => true,
            'data' => $rows->map(fn ($row) => [
                'eventId' => $row->event_id,
                'actorName' => $row->actor_name,
                'subjectType' => $row->subject_type,
                'subjectLabel' => $row->subject_label,
                'changeType' => $row->change_type,
                'permissionCode' => $row->permission_code,
                'oldState' => $row->old_state,
                'newState' => $row->new_state,
                'details' => $row->new_values ? json_decode($row->new_values, true) : null,
                'businessReason' => $row->business_reason,
                'changedAt' => $row->created_at,
            ]),
            'meta' => ['total' => $total],
        ]);
    }

    private function actorIsGlobal(): bool
    {
        return (int) (auth('api')->user()?->role ?? -1) === 0;
    }

    private function recordAudit(string $subjectType, string $subjectId, string $label, string $changeType, array $values): void
    {
        if (!SchemaSupport::hasTable('authorization_permission_audit_logs')) {
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
