<?php

namespace App\Services\Admin;

use App\Models\User;
use App\Services\Authorization\SchemaSupport;
use App\Services\Provisioning\CompanyMembershipService;
use App\Services\Provisioning\RoleResolver;
use App\Services\Provisioning\UnitMembershipService;
use App\Support\PermissionRegistry;
use App\Support\ProvisioningContext;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

class UserDirectory
{
    public const STATUS_ACTIVE = 'ACTIVE';
    public const STATUS_INACTIVE = 'INACTIVE';
    public const STATUS_LOCKED = 'LOCKED';
    public const STATUS_DELETED = 'DELETED';

    public const STATUSES = [
        self::STATUS_ACTIVE,
        self::STATUS_INACTIVE,
        self::STATUS_LOCKED,
        self::STATUS_DELETED,
    ];

    public const TYPE_SUPER_ADMIN = 'SUPER_ADMIN';
    public const TYPE_ADMIN = 'ADMIN';
    public const TYPE_AGENT = 'AGENT';
    public const TYPE_EMPLOYEE = 'EMPLOYEE';

    public const USER_TYPES = [
        self::TYPE_SUPER_ADMIN,
        self::TYPE_ADMIN,
        self::TYPE_AGENT,
        self::TYPE_EMPLOYEE,
    ];

    public const HR_ROLE_CODES = ['hr_manager', 'recruitment_manager'];

    public const MAX_PAGE_SIZE = 200;

    private const SORTABLE = [
        'name' => 'users.name',
        'empCode' => 'users.emp_code',
        'email' => 'users.email',
        'department' => 'users.department',
        'designation' => 'users.designation',
        'branch' => 'users.branch',
        'createdAt' => 'users.created_at',
        'lastLoginAt' => 'users.last_login_at',
    ];

    public function supportsAdministration(): bool
    {
        return SchemaSupport::hasColumn('users', 'locked_at')
            && SchemaSupport::hasColumn('users', 'deactivated_at');
    }

    public function query(User $actor, array $filters = []): Builder
    {
        $query = DB::table('users');

        $this->applyScope($query, $actor, $filters);
        $this->applyVisibility($query, $filters);
        $this->applyStatus($query, $filters);
        $this->applySearch($query, $filters);
        $this->applyFields($query, $filters);
        $this->applyRole($query, $filters);
        $this->applyDates($query, $filters);

        return $query;
    }

    /**
     * Super admin accounts stay out of the directory unless they are asked for.
     * They are platform identities rather than staff, and listing them beside
     * 340 employees invites an accidental lock or password reset on the one
     * account that can undo it. The summary still counts them, so the card
     * reports the real number.
     */
    public function includesSuperAdmins(array $filters): bool
    {
        return filter_var($filters['includeSuperAdmins'] ?? false, FILTER_VALIDATE_BOOLEAN)
            || strtoupper(trim((string) ($filters['userType'] ?? ''))) === self::TYPE_SUPER_ADMIN;
    }

    private function applyVisibility(Builder $query, array $filters): void
    {
        if (!$this->includesSuperAdmins($filters)) {
            $query->where('users.role', '!=', 0);
        }
    }

    public function paginate(User $actor, array $filters): array
    {
        $page = max(1, (int) ($filters['page'] ?? 1));
        $perPage = min(self::MAX_PAGE_SIZE, max(1, (int) ($filters['perPage'] ?? 25)));

        $query = $this->query($actor, $filters);
        $total = (clone $query)->count();

        [$column, $direction] = $this->sort($filters);

        $rows = $query
            ->orderBy($column, $direction)
            ->orderBy('users.id', 'desc')
            ->forPage($page, $perPage)
            ->get($this->selectColumns());

        return [
            'rows' => $this->hydrate($rows->all()),
            'page' => $page,
            'perPage' => $perPage,
            'total' => $total,
            'lastPage' => (int) ceil(max(1, $total) / $perPage),
        ];
    }

    public function export(User $actor, array $filters): array
    {
        $rows = $this->query($actor, $filters)
            ->orderBy('users.name')
            ->limit(self::MAX_PAGE_SIZE * 50)
            ->get($this->selectColumns());

        return $this->hydrate($rows->all());
    }

    public function summary(User $actor, array $filters = []): array
    {
        $statusCounts = [
            self::STATUS_ACTIVE => 0,
            self::STATUS_INACTIVE => 0,
            self::STATUS_LOCKED => 0,
            self::STATUS_DELETED => 0,
        ];

        $rows = $this->applyScopeOnly($actor, $filters)
            ->get(array_merge(['id', 'is_deleted', 'status'], $this->stateColumns()));

        foreach ($rows as $row) {
            $statusCounts[$this->statusOf($row)]++;
        }

        $typeCounts = [
            self::TYPE_SUPER_ADMIN => 0,
            self::TYPE_ADMIN => 0,
            self::TYPE_AGENT => 0,
            self::TYPE_EMPLOYEE => 0,
        ];

        $roleRows = $this->applyScopeOnly($actor, $filters)
            ->where('is_deleted', '0')
            ->groupBy('role')
            ->get([DB::raw('role'), DB::raw('count(*) as aggregate')]);

        foreach ($roleRows as $row) {
            $typeCounts[$this->userTypeOf((int) $row->role)] += (int) $row->aggregate;
        }

        return [
            'total' => array_sum($statusCounts) - $statusCounts[self::STATUS_DELETED],
            'active' => $statusCounts[self::STATUS_ACTIVE],
            'inactive' => $statusCounts[self::STATUS_INACTIVE],
            'locked' => $statusCounts[self::STATUS_LOCKED],
            'deleted' => $statusCounts[self::STATUS_DELETED],
            'superAdmin' => $typeCounts[self::TYPE_SUPER_ADMIN],
            'admin' => $typeCounts[self::TYPE_ADMIN],
            'hr' => $this->hrCount($actor, $filters),
            'employee' => $typeCounts[self::TYPE_EMPLOYEE],
            'agent' => $typeCounts[self::TYPE_AGENT],
        ];
    }

    public function filterOptions(
        User $actor,
        ?RoleResolver $resolver = null,
        ?CompanyMembershipService $companies = null,
        ?UnitMembershipService $units = null,
    ): array {
        $resolver ??= app(RoleResolver::class);
        $companies ??= app(CompanyMembershipService::class);
        $units ??= app(UnitMembershipService::class);

        $companyOptions = $companies->optionsFor($actor);

        $distinct = fn (string $column) => $this->applyScopeOnly($actor, [])
            ->where('is_deleted', '0')
            ->whereNotNull($column)
            ->where($column, '!=', '')
            ->distinct()
            ->orderBy($column)
            ->limit(500)
            ->pluck($column)
            ->all();

        $roles = [];

        if (SchemaSupport::hasTable('roles')) {
            $query = \App\Support\SystemRoles::exclude(DB::table('roles'))->orderBy('name');

            if (SchemaSupport::hasColumn('roles', 'status')) {
                $query->where('status', 'ACTIVE');
            }

            $roles = $query->limit(200)->get(['id', 'name', 'code'])->map(fn ($role) => [
                'id' => (int) $role->id,
                'name' => $role->name,
                'code' => $role->code ?? null,
            ])->all();
        }

        if ($roles !== []) {
            $summaries = $this->rolePermissionSummaries($roles);

            $roles = array_map(fn ($role) => $role + ($summaries[$role['id']] ?? [
                'grantedCount' => 0,
                'pages' => [],
                'more' => 0,
            ]), $roles);
        }

        return [
            'departments' => $distinct('department'),
            'designations' => $distinct('designation'),
            'branches' => $distinct('branch'),
            'units' => $distinct('unit'),
            'companies' => $distinct('company_code'),
            'roles' => $roles,
            'statuses' => self::STATUSES,
            'userTypes' => self::USER_TYPES,
            /*
             * Two lists, deliberately.
             *
             * Create and Edit ask different questions. Create asks "what kind of
             * account is this operator setting up", and Employee is not an answer
             * — employees arrive from the Trial and Appointment forms with a
             * company, a unit and their documents. Edit asks "what is this
             * account now", and Employee must be there or an administrator could
             * never be moved back to one.
             *
             * One filtered array serving both screens is the bug this replaces:
             * whichever rule it applied was wrong on the other screen.
             */
            'userTypeOptionsByContext' => [
                ProvisioningContext::DIRECT_CREATE => $resolver->options($actor, ProvisioningContext::DIRECT_CREATE),
                ProvisioningContext::EDIT_USER => $resolver->options($actor, ProvisioningContext::EDIT_USER),
            ],
            // Retained under its old name for any caller still reading it; it is
            // the edit list, which is the superset.
            'userTypeOptions' => $resolver->options($actor, ProvisioningContext::EDIT_USER),
            'companies' => $companyOptions,
            // Every unit within reach, carrying its company id so the picker can
            // group and filter without a second request.
            'unitOptions' => $units->optionsForCompanies(array_column($companyOptions, 'id')),
        ];
    }

    public function statusOf(object $row): string
    {
        if ((string) ($row->is_deleted ?? '0') === '1') {
            return self::STATUS_DELETED;
        }

        if (!empty($row->locked_at)) {
            return self::STATUS_LOCKED;
        }

        if (!empty($row->deactivated_at) || strtoupper((string) ($row->status ?? '')) === 'DISABLED') {
            return self::STATUS_INACTIVE;
        }

        return self::STATUS_ACTIVE;
    }

    public function userTypeOf(int $role): string
    {
        return match ($role) {
            0 => self::TYPE_SUPER_ADMIN,
            1, 2 => self::TYPE_ADMIN,
            4 => self::TYPE_AGENT,
            default => self::TYPE_EMPLOYEE,
        };
    }

    public function userTypeLabel(string $type): string
    {
        return match ($type) {
            self::TYPE_SUPER_ADMIN => 'Super Admin',
            self::TYPE_ADMIN => 'Admin',
            self::TYPE_AGENT => 'Agent',
            default => 'Employee',
        };
    }

    public function serialize(object $row, array $roles = []): array
    {
        $type = $this->userTypeOf((int) ($row->role ?? 3));

        return [
            'id' => (int) $row->id,
            'empCode' => $row->emp_code,
            'name' => $row->name,
            'username' => $row->username ?? null,
            'email' => $row->email,
            'mobile' => $row->mobile_number,
            'department' => $row->department,
            'designation' => $row->designation,
            'branch' => $row->branch,
            'unit' => $row->unit,
            'companyCode' => $row->company_code,
            'photo' => $this->photoUrl($row->photo ?? null),
            'userType' => $type,
            'userTypeLabel' => $this->userTypeLabel($type),
            'legacyRole' => (int) ($row->role ?? 3),
            'roles' => $roles,
            'roleLabel' => $roles[0]['name'] ?? $this->userTypeLabel($type),
            'status' => $this->statusOf($row),
            'lockedAt' => $row->locked_at ?? null,
            'lockReason' => $row->lock_reason ?? null,
            'deactivatedAt' => $row->deactivated_at ?? null,
            'deactivationReason' => $row->deactivation_reason ?? null,
            'lastLoginAt' => $row->last_login_at ?? null,
            'lastLoginIp' => $row->last_login_ip ?? null,
            'createdAt' => $row->created_at ?? null,
            'joiningDate' => $row->joining_date ?? null,
            'managerName' => $row->manager_name ?? null,
        ];
    }

    /** @param list<object> $rows */
    public function hydrate(array $rows): array
    {
        $roles = $this->rolesFor(array_map(static fn ($row) => (int) $row->id, $rows));

        return array_map(fn ($row) => $this->serialize($row, $roles[(int) $row->id] ?? []), $rows);
    }

    /** @param list<int> $userIds @return array<int, list<array>> */
    public function rolesFor(array $userIds): array
    {
        if (!$userIds || !SchemaSupport::hasTable('user_roles') || !SchemaSupport::hasTable('roles')) {
            return [];
        }

        $rows = DB::table('user_roles')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->whereIn('user_roles.user_id', $userIds)
            ->orderBy('roles.name')
            ->get(['user_roles.user_id', 'roles.id', 'roles.name', 'roles.code']);

        $out = [];

        foreach ($rows as $row) {
            $out[(int) $row->user_id][] = [
                'id' => (int) $row->id,
                'name' => $row->name,
                'code' => $row->code ?? null,
            ];
        }

        return $out;
    }

    /**
     * A compact "what can this role do" for the Assign Role picker.
     *
     * The assign-role dialog used to list role names with no indication of what
     * granting one would open, so an administrator picked blind and the
     * Permission Matrix remained the only place the answer lived. This batches
     * role_permissions across the visible roles and resolves each granted code
     * to the page label the registry renders, so the picker can show what a role
     * actually allows.
     *
     * @param  list<array{id:int,name:string,code:?string}>  $roles
     * @return array<int, array{grantedCount:int,pages:list<string>,more:int}>
     */
    private function rolePermissionSummaries(array $roles): array
    {
        if (! SchemaSupport::hasTable('role_permissions') || ! SchemaSupport::hasTable('permissions')) {
            return [];
        }

        $roleIds = array_column($roles, 'id');

        if ($roleIds === []) {
            return [];
        }

        $query = DB::table('role_permissions')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->whereIn('role_permissions.role_id', $roleIds);

        if (SchemaSupport::hasColumn('role_permissions', 'effect')) {
            $query->where('role_permissions.effect', 'ALLOW');
        }

        $perRole = [];

        foreach ($query->get(['role_permissions.role_id', 'permissions.code']) as $row) {
            $label = $this->permissionPageLabel($row->code);

            if ($label === null) {
                continue;
            }

            $roleId = (int) $row->role_id;
            $perRole[$roleId]['count'] = ($perRole[$roleId]['count'] ?? 0) + 1;
            $perRole[$roleId]['labels'][$label] = true;
        }

        $out = [];

        foreach ($roles as $role) {
            $roleId = (int) $role['id'];
            $labels = array_keys($perRole[$roleId]['labels'] ?? []);

            sort($labels, SORT_STRING);

            $out[$roleId] = [
                'grantedCount' => $perRole[$roleId]['count'] ?? 0,
                'pages' => array_slice($labels, 0, 6),
                'more' => max(0, count($labels) - 6),
            ];
        }

        return $out;
    }

    /**
     * The page label an administrator will recognise for a granted permission code.
     *
     * Registry keys resolve directly; legacy business codes (org.unit.read, ...)
     * resolve through the canonical nodes that imply them. Codes neither the
     * registry nor its implied map recognises fall back to the module label.
     */
    private function permissionPageLabel(string $code): ?string
    {
        $keys = PermissionRegistry::has($code)
            ? [$code]
            : PermissionRegistry::nodesImplying($code);

        foreach ($keys as $key) {
            $page = PermissionRegistry::pageOf($key);

            if ($page !== null) {
                return PermissionRegistry::node($page)['label'] ?? null;
            }

            $module = PermissionRegistry::moduleOf($key);

            if ($module !== null) {
                return PermissionRegistry::node($module)['label'] ?? null;
            }
        }

        return null;
    }

    public function selectColumns(): array
    {
        return array_merge([
            'users.id', 'users.name', 'users.email', 'users.emp_code', 'users.mobile_number',
            'users.department', 'users.designation', 'users.branch', 'users.unit',
            'users.company_code', 'users.photo', 'users.role', 'users.status',
            'users.is_deleted', 'users.created_at', 'users.joining_date', 'users.manager_name',
        ], array_map(
            static fn (string $column) => 'users.' . $column,
            $this->stateColumns()
        ));
    }

    /** @return list<string> */
    public function stateColumns(): array
    {
        return SchemaSupport::present('users', [
            'username', 'last_login_at', 'last_login_ip',
            'locked_at', 'locked_by', 'lock_reason',
            'deactivated_at', 'deactivated_by', 'deactivation_reason',
        ]);
    }

    public function scopeAllows(User $actor, object $target): bool
    {
        $role = (int) $actor->role;

        if ($role === 0) {
            return true;
        }

        $codes = $this->actorCompanyCodes($actor);

        if ($codes && !in_array((string) $target->company_code, $codes, true)) {
            return false;
        }

        return !($role === 2 && $actor->unit && (string) $target->unit !== (string) $actor->unit);
    }

    private function photoUrl(?string $value): ?string
    {
        if (!$value) {
            return null;
        }

        $user = new User();
        $user->setRawAttributes(['photo' => $value]);

        return $user->photo;
    }

    private function hrCount(User $actor, array $filters): int
    {
        if (!SchemaSupport::hasTable('user_roles') || !SchemaSupport::hasTable('roles')) {
            return 0;
        }

        return (int) $this->applyScopeOnly($actor, $filters)
            ->where('is_deleted', '0')
            ->whereIn('users.id', function ($query) {
                $query->select('user_roles.user_id')
                    ->from('user_roles')
                    ->join('roles', 'roles.id', '=', 'user_roles.role_id')
                    ->whereIn('roles.code', self::HR_ROLE_CODES);
            })
            ->count();
    }

    private function applyScopeOnly(User $actor, array $filters): Builder
    {
        $query = DB::table('users');
        $this->applyScope($query, $actor, $filters);

        return $query;
    }

    private function applyScope(Builder $query, User $actor, array $filters): void
    {
        // Hidden system accounts are excluded from every path — list, summary,
        // filter options, hr count and export all funnel through here. This is
        // stronger than the super-admin visibility toggle below: the
        // includeSuperAdmins filter can reveal role-0 accounts, but never a
        // hidden one.
        \App\Support\HiddenAccounts::exclude($query, 'users');

        $role = (int) $actor->role;

        if ($role === 2) {
            $query->where('users.company_code', $actor->company_code);

            if ($actor->unit) {
                $query->where('users.unit', $actor->unit);
            }

            return;
        }

        if ($role !== 0) {
            $codes = $this->actorCompanyCodes($actor);

            if ($codes) {
                $query->whereIn('users.company_code', $codes);
            }
        }

        $requested = trim((string) ($filters['companyCode'] ?? ''));

        if ($requested !== '' && !in_array($requested, ['all', 'all-companies'], true)) {
            $query->whereIn('users.company_code', array_filter(array_map('trim', explode(',', $requested))));
        }

        if (!empty($filters['unit'])) {
            $query->where('users.unit', $filters['unit']);
        }
    }

    /** @return list<string> */
    private function actorCompanyCodes(User $actor): array
    {
        return array_values(array_filter(array_map('trim', explode(',', (string) $actor->company_code))));
    }

    private function applyStatus(Builder $query, array $filters): void
    {
        $status = strtoupper(trim((string) ($filters['status'] ?? '')));
        $hasState = $this->supportsAdministration();

        if ($status === self::STATUS_DELETED) {
            $query->where('users.is_deleted', '1');

            return;
        }

        $query->where('users.is_deleted', '0');

        if ($status === self::STATUS_LOCKED) {
            $hasState ? $query->whereNotNull('users.locked_at') : $query->whereRaw('1 = 0');

            return;
        }

        if ($status === self::STATUS_INACTIVE) {
            $query->where(function ($inner) use ($hasState) {
                $inner->whereRaw("upper(coalesce(users.status, '')) = ?", ['DISABLED']);

                if ($hasState) {
                    $inner->orWhereNotNull('users.deactivated_at');
                }
            });

            if ($hasState) {
                $query->whereNull('users.locked_at');
            }

            return;
        }

        if ($status === self::STATUS_ACTIVE) {
            $query->whereRaw("upper(coalesce(users.status, '')) <> ?", ['DISABLED']);

            if ($hasState) {
                $query->whereNull('users.locked_at')->whereNull('users.deactivated_at');
            }
        }
    }

    private function applySearch(Builder $query, array $filters): void
    {
        $term = trim((string) ($filters['search'] ?? ''));

        if ($term === '') {
            return;
        }

        $like = '%' . $term . '%';
        $operator = $this->likeOperator();
        $hasUsername = SchemaSupport::hasColumn('users', 'username');

        $query->where(function ($inner) use ($like, $term, $operator, $hasUsername) {
            $inner->where('users.name', $operator, $like)
                ->orWhere('users.email', $operator, $like)
                ->orWhere('users.emp_code', $operator, $like)
                ->orWhere('users.mobile_number', $operator, $like)
                ->orWhere('users.department', $operator, $like)
                ->orWhere('users.designation', $operator, $like);

            if ($hasUsername) {
                $inner->orWhere('users.username', $operator, $like);
            }

            if (ctype_digit($term)) {
                $inner->orWhere('users.id', (int) $term);
            }
        });
    }

    private function applyFields(Builder $query, array $filters): void
    {
        $operator = $this->likeOperator();

        foreach ([
            'name' => 'users.name',
            'empCode' => 'users.emp_code',
            'email' => 'users.email',
            'mobile' => 'users.mobile_number',
            'username' => 'users.username',
        ] as $key => $column) {
            $value = trim((string) ($filters[$key] ?? ''));

            if ($value === '' || ($key === 'username' && !SchemaSupport::hasColumn('users', 'username'))) {
                continue;
            }

            $query->where($column, $operator, '%' . $value . '%');
        }

        foreach ([
            'department' => 'users.department',
            'designation' => 'users.designation',
            'branch' => 'users.branch',
        ] as $key => $column) {
            $value = trim((string) ($filters[$key] ?? ''));

            if ($value !== '') {
                $query->where($column, $value);
            }
        }

        $userType = strtoupper(trim((string) ($filters['userType'] ?? '')));

        if (in_array($userType, self::USER_TYPES, true)) {
            $query->whereIn('users.role', match ($userType) {
                self::TYPE_SUPER_ADMIN => [0],
                self::TYPE_ADMIN => [1, 2],
                self::TYPE_AGENT => [4],
                default => [3],
            });
        }
    }

    private function applyRole(Builder $query, array $filters): void
    {
        $roleId = (int) ($filters['roleId'] ?? 0);

        if ($roleId <= 0 || !SchemaSupport::hasTable('user_roles')) {
            return;
        }

        $query->whereIn('users.id', function ($inner) use ($roleId) {
            $inner->select('user_id')->from('user_roles')->where('role_id', $roleId);
        });
    }

    private function applyDates(Builder $query, array $filters): void
    {
        if (!empty($filters['createdFrom'])) {
            $query->whereDate('users.created_at', '>=', $filters['createdFrom']);
        }

        if (!empty($filters['createdTo'])) {
            $query->whereDate('users.created_at', '<=', $filters['createdTo']);
        }
    }

    private function sort(array $filters): array
    {
        $column = self::SORTABLE[(string) ($filters['sortBy'] ?? 'name')] ?? self::SORTABLE['name'];

        if ($column === 'users.last_login_at' && !SchemaSupport::hasColumn('users', 'last_login_at')) {
            $column = self::SORTABLE['name'];
        }

        return [$column, strtolower((string) ($filters['sortDir'] ?? 'asc')) === 'desc' ? 'desc' : 'asc'];
    }

    private function likeOperator(): string
    {
        return DB::connection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
    }
}
