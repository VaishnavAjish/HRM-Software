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

            $this->grantBaseline($role);

            $this->audit($role, 'CREATE', ['name' => $role->name, 'code' => $role->code]);

            return $role;
        });

        return $role;
    }

    /**
     * Every new custom role gets the self-service baseline so a user assigned
     * only this role can still load their own portal/profile. Without it a
     * fresh custom role denies self.profile.read, and no amount of page
     * permissions granted in the matrix makes the portal usable under enforced
     * mode. Self-scoped only — never admin/authorization/reveal permissions.
     */
    private function grantBaseline(Role $role): void
    {
        $baseline = [
            'self.profile.read',
            'self.profile.update',
            'self.payslip.read',
            'self.ticket.read',
            'self.ticket.create',
        ];

        // BUSINESS is the default custom-role type and represents a role that
        // works in the management shell. The shell grants no page or action by
        // itself; those remain controlled independently by the matrix.
        if (strtoupper((string) $role->role_type) === 'BUSINESS') {
            $baseline[] = 'ui.portals';
            $baseline[] = 'ui.portals.business';
        }

        $permissions = DB::table('permissions')
            ->whereIn('code', $baseline)
            ->where('is_active', true)
            ->get(['id', 'is_sensitive']);

        foreach ($permissions as $permission) {
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $role->id, 'permission_id' => $permission->id],
                [
                    'effect' => 'ALLOW',
                    'obligations' => null,
                    'inherit_to_children' => ! filter_var($permission->is_sensitive, FILTER_VALIDATE_BOOLEAN),
                ]
            );
        }
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

    /**
     * Remove a role, and when forced, everything that points at it.
     *
     * Dependent rows are cleared explicitly rather than left to the database.
     * Cascade behaviour differs per engine — PostgreSQL here removed the
     * assignment silently while the SQLite deployment refused and returned a
     * 500 — so the same delete produced two different outcomes, neither of them
     * announced. Doing it in the transaction makes the result identical
     * everywhere and keeps it atomic: either the role and its references go, or
     * nothing does.
     */
    public function delete(Role $role, bool $force = false): void
    {
        DB::transaction(function () use ($role, $force) {
            if ($force) {
                DB::table('user_roles')->where('role_id', $role->id)->delete();

                // Each table names the role differently: assignments carry
                // role_id, inheritance carries parent_role_id and child_role_id.
                // Both sides of an inheritance edge have to go, or the surviving
                // role keeps a link to a row that no longer exists.
                $references = [
                    'authorization_role_assignments' => ['role_id'],
                    'authorization_role_inheritances' => ['parent_role_id', 'child_role_id'],
                ];

                foreach ($references as $table => $columns) {
                    if (! SchemaSupport::hasTable($table)) {
                        continue;
                    }

                    foreach ($columns as $column) {
                        if (SchemaSupport::hasColumn($table, $column)) {
                            DB::table($table)->where($column, $role->id)->delete();
                        }
                    }
                }
            }

            DB::table('role_permissions')->where('role_id', $role->id)->delete();

            $this->audit($role, 'DELETE', [
                'name' => $role->name,
                'code' => $role->code,
                'forced' => $force,
            ]);

            $role->delete();
        });

        $this->invalidate($role);
    }

    /**
     * Users holding this role, counted across both assignment records.
     *
     * This is the guard that stops a role being deleted out from under its
     * holders, so it has to see every way a role can be held. It previously read
     * authorization_role_assignments alone and only fell back to user_roles when
     * that table was absent — but User::roles() is a belongsToMany on user_roles,
     * and the two disagree.
     *
     * A role held only through user_roles therefore reported zero holders and
     * sailed past the ROLE_HAS_ASSIGNED_USERS check. On PostgreSQL the delete
     * then cascaded and silently destroyed the assignment; on the SQLite
     * deployment the foreign key refused and the request died as a 500 with an
     * HTML body the client could not parse.
     */
    public function assignedUserCount(Role $role): int
    {
        $userIds = DB::table('user_roles')->where('role_id', $role->id)->pluck('user_id');

        if (SchemaSupport::hasTable('authorization_role_assignments')) {
            $userIds = $userIds->concat(
                DB::table('authorization_role_assignments')
                    ->where('role_id', $role->id)
                    ->where('status', 'ACTIVE')
                    ->pluck('user_id')
            );
        }

        return $userIds->filter()->unique()->count();
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

        // Not permitted to see the Admin tier. The codes come from the
        // hierarchy rather than being listed here: this named
        // `tenant_administrator` only, so on a database whose administrator role
        // is coded `admin` the tier it was hiding stayed fully visible.
        return $query->where(function ($inner) {
            $inner->where(function ($q) {
                $q->whereNull('roles.role_class')
                    ->orWhere('roles.role_class', '!=', RoleHierarchy::ADMIN);
            })->whereNotIn('roles.code', RoleHierarchy::codesForClass(RoleHierarchy::ADMIN));
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
