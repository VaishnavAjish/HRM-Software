<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\AuthorizationRoleAssignment;
use App\Models\Role;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\ConditionEvaluator;
use App\Services\Authorization\SeparationOfDuties;
use App\Support\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

class EnterpriseRoleController extends Controller
{
    public function __construct(
        private readonly AuthorizationCache $cache,
        private readonly ConditionEvaluator $conditions,
        private readonly SeparationOfDuties $sod,
    ) {
    }

    public function index(Request $request)
    {
        $actor = auth('api')->user();
        $query = Role::withCount(['permissions', 'users', 'assignments'])->orderBy('name');
        if ((int) $actor->role !== 0) {
            $query->where(fn ($q) => $q->whereNull('tenant_id')->orWhere('tenant_id', $actor->company_code));
        }
        if ($search = trim((string) $request->query('search'))) {
            $query->where(fn ($q) => $q->where('name', 'like', "%{$search}%")->orWhere('code', 'like', "%{$search}%"));
        }
        return response()->json(['success' => true, 'data' => $query->paginate(min(100, max(1, (int) $request->query('limit', 25))))]);
    }

    public function show(Role $role)
    {
        return response()->json(['success' => true, 'data' => $role->load(['permissions.group', 'parentRoles'])->loadCount('assignments')]);
    }

    public function store(Request $request)
    {
        $data = $this->validated($request);
        $role = DB::transaction(function () use ($data, $request) {
            $role = Role::create($data + ['created_by' => auth('api')->id(), 'updated_by' => auth('api')->id()]);
            $this->syncPermissions($role, $request->input('permissionAssignments', []));
            return $role;
        });
        $this->cache->invalidate($role->tenant_id);
        AuditLogger::log($request, 'CREATE', 'EnterpriseRole', null, ['role_id' => $role->id, 'code' => $role->code]);
        return response()->json(['success' => true, 'data' => $role->load('permissions')], 201);
    }

    public function update(Request $request, Role $role)
    {
        $data = $this->validated($request, $role);
        DB::transaction(function () use ($data, $request, $role) {
            $role->update($data + ['updated_by' => auth('api')->id(), 'version' => $role->version + 1]);
            if ($request->has('permissionAssignments')) {
                $this->syncPermissions($role, $request->input('permissionAssignments', []));
            }
        });
        $this->cache->invalidate($role->tenant_id);
        AuditLogger::log($request, 'UPDATE', 'EnterpriseRole', ['role_id' => $role->id], ['version' => $role->version]);
        return response()->json(['success' => true, 'data' => $role->fresh()->load('permissions')]);
    }

    public function destroy(Request $request, Role $role)
    {
        if ($role->is_system || $role->assignments()->exists() || $role->users()->exists()) {
            return response()->json(['success' => false, 'error' => ['code' => 'ROLE_IN_USE', 'message' => 'System or assigned roles cannot be deleted.']], 409);
        }
        $tenant = $role->tenant_id;
        $snapshot = ['id' => $role->id, 'code' => $role->code];
        $role->delete();
        $this->cache->invalidate($tenant);
        AuditLogger::log($request, 'DELETE', 'EnterpriseRole', $snapshot);
        return response()->json(['success' => true]);
    }

    public function clone(Request $request, Role $role)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150', 'unique:roles,name'],
            'code' => ['required', 'string', 'max:150', 'regex:/^[a-z][a-z0-9_]*$/', 'unique:roles,code'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);
        $clone = DB::transaction(function () use ($data, $role) {
            $copy = $role->replicate(['is_system', 'version', 'created_by', 'updated_by']);
            $copy->fill($data + ['is_system' => false, 'version' => 1, 'created_by' => auth('api')->id(), 'updated_by' => auth('api')->id()]);
            $copy->save();
            $pivot = DB::table('role_permissions')->where('role_id', $role->id)->get();
            foreach ($pivot as $row) {
                DB::table('role_permissions')->insert([
                    'role_id' => $copy->id, 'permission_id' => $row->permission_id,
                    'effect' => $row->effect, 'conditions' => $row->conditions,
                    'obligations' => $row->obligations, 'inherit_to_children' => $row->inherit_to_children,
                    'valid_from' => $row->valid_from, 'valid_until' => $row->valid_until,
                ]);
            }
            return $copy;
        });
        $this->cache->invalidate($clone->tenant_id);
        AuditLogger::log($request, 'CLONE', 'EnterpriseRole', ['source_role_id' => $role->id], ['role_id' => $clone->id]);
        return response()->json(['success' => true, 'data' => $clone->load('permissions')], 201);
    }

    public function assign(Request $request, Role $role)
    {
        $data = $request->validate([
            'userId' => ['required', 'exists:users,id'],
            'tenantId' => ['nullable', 'string', 'max:100'],
            'scopeType' => ['required', Rule::in(['GLOBAL','TENANT','GROUP','COMPANY','LEGAL_ENTITY','BRANCH','LOCATION','BUSINESS_UNIT','DEPARTMENT','TEAM','SELF','OWN_RECORDS','DIRECT_REPORTS','INDIRECT_REPORTS','ASSIGNED_RECORDS','SHARED_RECORDS','SELECTED_RECORDS','CUSTOM_FILTER'])],
            'scopeId' => ['nullable', 'string', 'max:500'],
            'validFrom' => ['nullable', 'date'],
            'validUntil' => ['nullable', 'date', 'after:validFrom'],
            'reason' => ['required', 'string', 'min:5', 'max:1000'],
        ]);
        if (!$role->is_assignable || $role->status !== 'ACTIVE') {
            return response()->json(['success' => false, 'error' => ['code' => 'ROLE_NOT_ASSIGNABLE', 'message' => 'This role cannot be assigned.']], 422);
        }
        $conflicts = $this->sod->conflicts((int) $data['userId'], $role, $data['tenantId'] ?? $role->tenant_id);
        if (collect($conflicts)->contains(fn ($row) => $row['enforcement'] === 'BLOCK')) {
            return response()->json(['success' => false, 'error' => [
                'code' => 'SOD_CONFLICT', 'message' => 'This assignment conflicts with separation-of-duties rules.',
                'conflicts' => $conflicts,
            ]], 409);
        }
        $assignment = AuthorizationRoleAssignment::create([
            'user_id' => $data['userId'], 'role_id' => $role->id,
            'tenant_id' => $data['tenantId'] ?? $role->tenant_id,
            'scope_type' => $data['scopeType'], 'scope_id' => $data['scopeId'] ?? null,
            'valid_from' => $data['validFrom'] ?? now(), 'valid_until' => $data['validUntil'] ?? null,
            'assignment_source' => 'MANUAL', 'assignment_reason' => $data['reason'],
            'assigned_by' => auth('api')->id(), 'approved_by' => $role->requires_approval ? null : auth('api')->id(),
            'status' => $role->requires_approval ? 'PENDING_APPROVAL' : 'ACTIVE',
        ]);
        $this->cache->invalidate($assignment->tenant_id);
        AuditLogger::log($request, 'ASSIGN', 'EnterpriseRole', null, ['assignment_id' => $assignment->id, 'role_id' => $role->id, 'user_id' => $data['userId']]);
        return response()->json(['success' => true, 'data' => $assignment], 201);
    }

    public function inherit(Request $request, Role $role)
    {
        $data = $request->validate([
            'parentRoleId' => ['required', 'integer', 'exists:roles,id'],
            'inheritSensitive' => ['boolean'], 'maxDepth' => ['nullable', 'integer', 'between:1,8'],
        ]);
        if ($role->id === (int) $data['parentRoleId'] || $this->wouldCreateCycle($role->id, (int) $data['parentRoleId'])) {
            return response()->json(['success' => false, 'error' => ['code' => 'ROLE_INHERITANCE_CYCLE', 'message' => 'This inheritance would create a cycle.']], 409);
        }
        DB::table('authorization_role_inheritances')->updateOrInsert([
            'parent_role_id' => $data['parentRoleId'], 'child_role_id' => $role->id,
        ], [
            'inherit_sensitive' => $data['inheritSensitive'] ?? false, 'max_depth' => $data['maxDepth'] ?? 8,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->cache->invalidate($role->tenant_id);
        AuditLogger::log($request, 'INHERIT', 'EnterpriseRole', null, ['child_role_id' => $role->id, 'parent_role_id' => $data['parentRoleId']]);
        return response()->json(['success' => true, 'data' => $role->fresh()->load('parentRoles')]);
    }

    public function removeInheritance(Request $request, Role $role, Role $parentRole)
    {
        DB::table('authorization_role_inheritances')->where('child_role_id', $role->id)
            ->where('parent_role_id', $parentRole->id)->delete();
        $this->cache->invalidate($role->tenant_id);
        AuditLogger::log($request, 'REMOVE_INHERITANCE', 'EnterpriseRole', ['child_role_id' => $role->id, 'parent_role_id' => $parentRole->id]);
        return response()->json(['success' => true]);
    }

    private function wouldCreateCycle(int $childId, int $parentId): bool
    {
        $queue = [$parentId];
        $seen = [];
        for ($depth = 0; $queue && $depth < 9; $depth++) {
            $current = array_shift($queue);
            if ($current === $childId) return true;
            if (isset($seen[$current])) continue;
            $seen[$current] = true;
            foreach (DB::table('authorization_role_inheritances')->where('child_role_id', $current)->pluck('parent_role_id') as $next) {
                $queue[] = (int) $next;
            }
        }
        return false;
    }

    private function validated(Request $request, ?Role $role = null): array
    {
        return $request->validate([
            'name' => ['required', 'string', 'max:150', Rule::unique('roles', 'name')->ignore($role?->id)],
            'code' => ['required', 'string', 'max:150', 'regex:/^[a-z][a-z0-9_]*$/', Rule::unique('roles', 'code')->ignore($role?->id)],
            'description' => ['nullable', 'string', 'max:1000'],
            'type' => ['nullable', Rule::in(['System', 'Custom'])],
            'role_type' => ['required', Rule::in(['SYSTEM','BUSINESS','JOB','CUSTOM','TEMPORARY','DELEGATED','EMERGENCY','READ_ONLY','EXTERNAL','SERVICE_ACCOUNT'])],
            'tenant_id' => ['nullable', 'string', 'max:100'],
            'is_active' => ['boolean'], 'is_system' => ['boolean'], 'is_assignable' => ['boolean'],
            'is_sensitive' => ['boolean'], 'requires_approval' => ['boolean'],
            'default_scope_type' => ['required', 'string', 'max:32'],
            'status' => ['required', Rule::in(['ACTIVE','DISABLED','ARCHIVED'])],
            'permissionAssignments' => ['nullable', 'array'],
        ]);
    }

    private function syncPermissions(Role $role, array $assignments): void
    {
        $sync = [];
        foreach ($assignments as $assignment) {
            validator($assignment, [
                'permissionId' => ['required', 'exists:permissions,id'],
                'effect' => ['required', Rule::in(['ALLOW', 'DENY'])],
                'conditions' => ['nullable', 'array'], 'obligations' => ['nullable', 'array'],
                'inheritToChildren' => ['boolean'],
            ])->validate();
            $this->conditions->validate($assignment['conditions'] ?? null);
            $sync[$assignment['permissionId']] = [
                'effect' => $assignment['effect'],
                'conditions' => isset($assignment['conditions']) ? json_encode($assignment['conditions']) : null,
                'obligations' => isset($assignment['obligations']) ? json_encode($assignment['obligations']) : null,
                'inherit_to_children' => $assignment['inheritToChildren'] ?? true,
                'valid_from' => $assignment['validFrom'] ?? null,
                'valid_until' => $assignment['validUntil'] ?? null,
            ];
        }
        $role->permissions()->sync($sync);
    }
}
