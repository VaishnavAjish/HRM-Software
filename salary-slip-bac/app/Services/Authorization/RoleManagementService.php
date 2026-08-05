<?php

namespace App\Services\Authorization;

use App\Models\Role;
use App\Support\RoleHierarchy;
use App\Support\SystemRoles;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RoleManagementService
{
    public function __construct(private readonly AuthorizationCache $cache)
    {
    }

    public function paginate(array $filters): array
    {
        $query = $this->baseQuery();

        if (!empty($filters['search'])) {
            $term = '%' . $filters['search'] . '%';
            $query->where(function ($inner) use ($term) {
                $inner->where('roles.name', 'like', $term)
                    ->orWhere('roles.code', 'like', $term)
                    ->orWhere('roles.description', 'like', $term);
            });
        }

        if (!empty($filters['status']) && SchemaSupport::hasColumn('roles', 'status')) {
            $query->where('roles.status', $filters['status']);
        }

        if (!empty($filters['type'])) {
            $query->where('roles.type', $filters['type']);
        }

        if (!empty($filters['roleType']) && SchemaSupport::hasColumn('roles', 'role_type')) {
            $query->where('roles.role_type', $filters['roleType']);
        }

        if (isset($filters['isActive']) && $filters['isActive'] !== '' && SchemaSupport::hasColumn('roles', 'is_active')) {
            $query->where('roles.is_active', (bool) $filters['isActive']);
        }

        $perPage = min(max((int) ($filters['perPage'] ?? 25), 1), 100);
        $page = $query->orderBy('roles.name')->paginate($perPage, ['*'], 'page', (int) ($filters['page'] ?? 1));

        return [
            'data' => collect($page->items())->map(fn (Role $role) => $this->serialize($role))->all(),
            'meta' => [
                'total' => $page->total(),
                'perPage' => $page->perPage(),
                'currentPage' => $page->currentPage(),
                'lastPage' => $page->lastPage(),
            ],
        ];
    }

    public function summary(): array
    {
        // Counters must agree with the table: same concealment, same tier scope.
        $base = fn () => $this->scopeToActor(SystemRoles::exclude(DB::table('roles')));

        $total = $base()->count();
        $active = SchemaSupport::hasColumn('roles', 'is_active') ? $base()->where('is_active', true)->count() : $total;
        $system = $base()->where('type', 'System')->count();
        $archived = SchemaSupport::hasColumn('roles', 'status') ? $base()->where('status', 'ARCHIVED')->count() : 0;

        return [
            'total' => $total,
            'active' => $active,
            'inactive' => $total - $active,
            'system' => $system,
            'custom' => $total - $system,
            'archived' => $archived,
        ];
    }

    public function find(int $id): ?Role
    {
        $role = Role::query()->whereKey($id)->first();

        if ($role === null || SystemRoles::isProtected($role)) {
            return null;
        }

        return $role;
    }

    public function create(array $data): Role
    {
        $role = DB::transaction(function () use ($data) {
            $attributes = ['name' => $data['name'], 'type' => 'Custom', 'is_active' => true];

            $optional = [
                'code' => $data['code'] ?? Str::slug($data['name'], '_'),
                'description' => $data['description'] ?? null,
                'role_type' => $data['roleType'] ?? 'BUSINESS',
                'tenant_id' => $data['tenantId'] ?? null,
                'is_system' => false,
                'is_assignable' => $data['isAssignable'] ?? true,
                'is_sensitive' => $data['isSensitive'] ?? false,
                'requires_approval' => $data['requiresApproval'] ?? false,
                'default_scope_type' => $data['defaultScopeType'] ?? 'TENANT',
                'status' => 'ACTIVE',
                'version' => 1,
                'created_by' => Auth::guard('api')->id(),
            ];

            foreach ($optional as $column => $value) {
                if (SchemaSupport::hasColumn('roles', $column)) {
                    $attributes[$column] = $value;
                }
            }

            $role = Role::create($attributes);

            $this->audit($role, 'CREATE', ['name' => $role->name, 'code' => $role->code]);

            return $role;
        });

        return $role;
    }

    public function update(Role $role, array $data): Role
    {
        $before = $this->snapshot($role);

        $map = [
            'name' => 'name',
            'code' => 'code',
            'description' => 'description',
            'roleType' => 'role_type',
            'tenantId' => 'tenant_id',
            'defaultScopeType' => 'default_scope_type',
            'isAssignable' => 'is_assignable',
            'isSensitive' => 'is_sensitive',
            'requiresApproval' => 'requires_approval',
            'isActive' => 'is_active',
        ];

        DB::transaction(function () use ($role, $data, $map, $before) {
            foreach ($map as $input => $column) {
                if (array_key_exists($input, $data) && SchemaSupport::hasColumn('roles', $column)) {
                    $role->{$column} = $data[$input];
                }
            }

            if (SchemaSupport::hasColumn('roles', 'updated_by')) {
                $role->updated_by = Auth::guard('api')->id();
            }

            if (SchemaSupport::hasColumn('roles', 'version')) {
                $role->version = (int) $role->version + 1;
            }

            $role->save();

            $this->audit($role, 'UPDATE', ['before' => $before, 'after' => $this->snapshot($role)]);
        });

        $this->invalidate($role);

        return $role->fresh();
    }

    public function setStatus(Role $role, string $status, bool $isActive): Role
    {
        $before = $this->snapshot($role);

        DB::transaction(function () use ($role, $status, $isActive) {
            if (SchemaSupport::hasColumn('roles', 'status')) {
                $role->status = $status;
            }
            if (SchemaSupport::hasColumn('roles', 'is_active')) {
                $role->is_active = $isActive;
            }
            if (SchemaSupport::hasColumn('roles', 'updated_by')) {
                $role->updated_by = Auth::guard('api')->id();
            }
            $role->save();
        });

        $this->audit($role, 'STATUS', ['before' => $before, 'status' => $status, 'isActive' => $isActive]);
        $this->invalidate($role);

        return $role->fresh();
    }

    public function delete(Role $role): void
    {
        DB::transaction(function () use ($role) {
            $this->audit($role, 'DELETE', ['name' => $role->name, 'code' => $role->code]);
            $role->delete();
        });

        $this->invalidate($role);
    }

    public function assignedUserCount(Role $role): int
    {
        if (SchemaSupport::hasTable('authorization_role_assignments')) {
            return (int) DB::table('authorization_role_assignments')
                ->where('role_id', $role->id)->where('status', 'ACTIVE')->count();
        }

        return (int) DB::table('user_roles')->where('role_id', $role->id)->count();
    }

    public function present(Role $role): array
    {
        return $this->serialize($role);
    }

    private function baseQuery()
    {
        return $this->scopeToActor(SystemRoles::exclude(Role::query()));
    }

    /**
     * A caller sees only the tiers they may manage.
     *
     * Filtering happens in SQL, not after the fact in the client: an
     * administrator must not receive Admin rows at all, because "returned but
     * hidden by the browser" is the same as returned. The hidden internal
     * identity is already excluded by SystemRoles::exclude() above; this narrows
     * further by tier.
     *
     * Roles predating the role_class backfill have NULL, so the classes are
     * matched by code as well — otherwise an un-migrated database would show an
     * administrator nothing at all.
     */
    private function scopeToActor($query)
    {
        $actor = auth('api')->user();
        $manageable = RoleHierarchy::MANAGEABLE[RoleHierarchy::actorClass($actor)] ?? [];

        if ($manageable === []) {
            return $query->whereRaw('1 = 0');
        }

        if (in_array(RoleHierarchy::ADMIN, $manageable, true)) {
            return $query;
        }

        // Not permitted to see the Admin tier.
        return $query->where(function ($inner) {
            $inner->where(function ($q) {
                $q->whereNull('roles.role_class')
                    ->orWhere('roles.role_class', '!=', RoleHierarchy::ADMIN);
            })->whereNotIn('roles.code', ['tenant_administrator']);
        });
    }

    private function serialize(Role $role): array
    {
        return [
            'id' => $role->id,
            'name' => $role->name,
            'code' => $role->code,
            'description' => $role->description,
            'type' => $role->type,
            'roleType' => $role->role_type,
            'tenantId' => $role->tenant_id,
            'isActive' => (bool) $role->is_active,
            'isSystem' => (bool) $role->is_system,
            'isAssignable' => (bool) $role->is_assignable,
            'isSensitive' => (bool) $role->is_sensitive,
            'requiresApproval' => (bool) $role->requires_approval,
            'defaultScopeType' => $role->default_scope_type,
            'status' => $role->status,
            'version' => $role->version,
            'permissionCount' => DB::table('role_permissions')->where('role_id', $role->id)->count(),
            'assignedUserCount' => $this->assignedUserCount($role),
            'createdAt' => optional($role->created_at)->toIso8601String(),
            'updatedAt' => optional($role->updated_at)->toIso8601String(),
        ];
    }

    private function snapshot(Role $role): array
    {
        return [
            'name' => $role->name,
            'code' => $role->code,
            'description' => $role->description,
            'roleType' => $role->role_type,
            'isActive' => (bool) $role->is_active,
            'isAssignable' => (bool) $role->is_assignable,
            'status' => $role->status,
        ];
    }

    private function invalidate(Role $role): void
    {
        $this->cache->invalidate($role->tenant_id ?? null);
    }

    private function audit(Role $role, string $changeType, array $values): void
    {
        if (!SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return;
        }

        DB::table('authorization_permission_audit_logs')->insert([
            'event_id' => (string) Str::uuid(),
            'tenant_id' => Auth::guard('api')->user()?->company_code ?: null,
            'actor_id' => Auth::guard('api')->id(),
            'subject_type' => 'ROLE',
            'subject_id' => (string) $role->id,
            'subject_label' => $role->name,
            'change_type' => $changeType,
            'new_values' => json_encode($values),
            'request_id' => request()?->header('X-Request-Id'),
            'ip_address' => request()?->ip(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
