<?php

namespace App\Services\Admin;

use App\Models\User;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\SchemaSupport;
use App\Support\AuditLogger;
use App\Support\UserTypeRoles;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class UserAccountService
{
    public const MODULE = 'access-control-users';

    public const CHANGE_CREATE = 'CREATE';
    public const CHANGE_UPDATE = 'UPDATE';
    public const CHANGE_DELETE = 'DELETE';
    public const CHANGE_LOCK = 'LOCK';
    public const CHANGE_UNLOCK = 'UNLOCK';
    public const CHANGE_ACTIVATE = 'ACTIVATE';
    public const CHANGE_DEACTIVATE = 'DEACTIVATE';
    public const CHANGE_ROLE_ASSIGN = 'ROLE_ASSIGNMENT';
    public const CHANGE_PERMISSION_ASSIGN = 'PERMISSION_ASSIGNMENT';
    public const CHANGE_PASSWORD_RESET = 'PASSWORD_RESET';

    private const AUDITED_FIELDS = [
        'name', 'email', 'username', 'emp_code', 'mobile_number', 'department',
        'designation', 'branch', 'unit', 'company_code', 'role', 'status',
        'joining_date', 'manager_name', 'dob', 'gender',
        'locked_at', 'deactivated_at', 'is_deleted',
    ];

    public function __construct(
        private readonly UserDirectory $directory,
        private readonly AuthorizationCache $cache,
    ) {
    }

    public function create(array $data, User $actor): User
    {
        $user = new User();
        $user->fill($this->fillable($data));
        $user->password = $data['password'];
        $user->role = (int) ($data['role'] ?? 3);
        $user->is_deleted = '0';
        $user->status = $data['status'] ?? '0';
        $user->added_by = $actor->id;

        if (SchemaSupport::hasColumn('users', 'username') && !empty($data['username'])) {
            $user->username = $data['username'];
        }

        $user->save();

        if (!empty($data['roleIds'])) {
            $this->assignRoles($user, $data['roleIds'], $actor, 'Created with the account');
        }

        $this->syncIdentityRole($user);

        $this->audit($user, self::CHANGE_CREATE, null, $this->snapshot($user), $data['businessReason'] ?? null);

        return $user;
    }

    public function update(User $user, array $data, User $actor): User
    {
        $before = $this->snapshot($user);

        $user->fill($this->fillable($data));

        if (SchemaSupport::hasColumn('users', 'username') && array_key_exists('username', $data)) {
            $user->username = $data['username'] ?: null;
        }

        if (array_key_exists('role', $data) && $data['role'] !== null) {
            $user->role = (int) $data['role'];
        }

        $user->save();

        if (array_key_exists('role', $data) && $data['role'] !== null) {
            $this->syncIdentityRole($user);
        }

        $this->audit($user, self::CHANGE_UPDATE, $before, $this->snapshot($user), $data['businessReason'] ?? null);
        $this->cache->invalidate($user->company_code ?: null);

        return $user;
    }

    /**
     * Bring the RBAC assignment in line with the user's type.
     *
     * Only identity roles are touched. A user granted HR Manager or ACC keeps
     * them across a type change — those are additional capability, not a second
     * answer to "who is this person", and silently revoking them here would make
     * an unrelated edit remove access nobody asked to remove.
     */
    private function syncIdentityRole(User $user): void
    {
        if (! SchemaSupport::hasTable('user_roles')) {
            return;
        }

        try {
            $identityIds = UserTypeRoles::identityRoleIds();
            $target = UserTypeRoles::roleFor($user->role);

            $keep = $user->roles()->pluck('roles.id')
                ->reject(fn ($id) => in_array($id, $identityIds, true))
                ->all();

            if ($target !== null) {
                $keep[] = $target->id;
            }

            $user->roles()->sync(array_values(array_unique($keep)));
        } catch (\Throwable $e) {
            // A deployment without the pivot must not fail account creation.
            report($e);
        }
    }

    public function softDelete(User $user, User $actor, ?string $reason = null): void
    {
        $before = $this->snapshot($user);

        $user->is_deleted = '1';

        if (SchemaSupport::hasColumn('users', 'deactivated_at')) {
            $user->deactivated_at = now();
            $user->deactivated_by = $actor->id;
            $user->deactivation_reason = $reason;
        }

        $user->save();

        $this->audit($user, self::CHANGE_DELETE, $before, $this->snapshot($user), $reason);
        $this->cache->invalidate($user->company_code ?: null);
    }

    public function lock(User $user, User $actor, string $reason): void
    {
        $this->requireAdministrationColumns();

        $before = $this->snapshot($user);

        $user->locked_at = now();
        $user->locked_by = $actor->id;
        $user->lock_reason = $reason;
        $user->save();

        $this->audit($user, self::CHANGE_LOCK, $before, $this->snapshot($user), $reason);
        $this->cache->invalidate($user->company_code ?: null);
    }

    public function unlock(User $user, User $actor, string $reason): void
    {
        $this->requireAdministrationColumns();

        $before = $this->snapshot($user);

        $user->locked_at = null;
        $user->locked_by = null;
        $user->lock_reason = null;
        $user->save();

        $this->audit($user, self::CHANGE_UNLOCK, $before, $this->snapshot($user), $reason);
        $this->cache->invalidate($user->company_code ?: null);
    }

    public function activate(User $user, User $actor, ?string $reason = null): void
    {
        $before = $this->snapshot($user);

        if (SchemaSupport::hasColumn('users', 'deactivated_at')) {
            $user->deactivated_at = null;
            $user->deactivated_by = null;
            $user->deactivation_reason = null;
        }

        if (strtoupper((string) $user->status) === 'DISABLED') {
            $user->status = '0';
        }

        $user->save();

        $this->audit($user, self::CHANGE_ACTIVATE, $before, $this->snapshot($user), $reason);
        $this->cache->invalidate($user->company_code ?: null);
    }

    public function deactivate(User $user, User $actor, string $reason): void
    {
        $before = $this->snapshot($user);

        if (SchemaSupport::hasColumn('users', 'deactivated_at')) {
            $user->deactivated_at = now();
            $user->deactivated_by = $actor->id;
            $user->deactivation_reason = $reason;
        } else {
            $user->status = 'DISABLED';
        }

        $user->save();

        $this->audit($user, self::CHANGE_DEACTIVATE, $before, $this->snapshot($user), $reason);
        $this->cache->invalidate($user->company_code ?: null);
    }

    public function resetPassword(User $user, User $actor, ?string $password, ?string $reason = null): string
    {
        $issued = $password ?: Str::password(14, true, true, false);

        $user->password = $issued;
        $user->save();

        $this->audit(
            $user,
            self::CHANGE_PASSWORD_RESET,
            null,
            ['passwordReset' => true, 'generated' => $password === null, 'actorId' => $actor->id],
            $reason
        );

        return $issued;
    }

    /** @param list<int> $roleIds */
    public function assignRoles(User $user, array $roleIds, User $actor, ?string $reason = null): array
    {
        $roleIds = array_values(array_unique(array_map('intval', $roleIds)));
        $before = $this->roleIdsOf($user);

        DB::transaction(function () use ($user, $roleIds, $actor, $reason) {
            $user->roles()->sync($roleIds);

            if (!SchemaSupport::hasTable('authorization_role_assignments')) {
                return;
            }

            DB::table('authorization_role_assignments')
                ->where('user_id', $user->id)
                ->whereNotIn('role_id', $roleIds ?: [0])
                ->update(['status' => 'REVOKED', 'updated_at' => now()]);

            foreach ($roleIds as $roleId) {
                DB::table('authorization_role_assignments')->updateOrInsert(
                    [
                        'user_id' => $user->id,
                        'role_id' => $roleId,
                        'tenant_id' => $user->company_code ?: null,
                        'scope_type' => 'TENANT',
                        'scope_id' => $user->company_code ?: null,
                    ],
                    [
                        'valid_from' => now(),
                        'assignment_source' => 'ADMIN_CONSOLE',
                        'assignment_reason' => $reason,
                        'assigned_by' => $actor->id,
                        'status' => 'ACTIVE',
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            }
        });

        $after = $this->roleIdsOf($user);

        $this->audit($user, self::CHANGE_ROLE_ASSIGN, ['roleIds' => $before], ['roleIds' => $after], $reason);
        $this->cache->invalidate($user->company_code ?: null);

        return $after;
    }

    /** @param list<array{permissionId:int,isDenied?:bool}> $grants */
    public function assignPermissions(User $user, array $grants, User $actor, ?string $reason = null): array
    {
        if (!SchemaSupport::hasTable('user_permissions')) {
            return [];
        }

        $before = $this->directPermissionsOf($user);

        DB::transaction(function () use ($user, $grants) {
            DB::table('user_permissions')->where('user_id', $user->id)->delete();

            foreach ($grants as $grant) {
                DB::table('user_permissions')->insert([
                    'user_id' => $user->id,
                    'permission_id' => (int) $grant['permissionId'],
                    'is_denied' => (bool) ($grant['isDenied'] ?? false),
                    'valid_from' => $grant['validFrom'] ?? null,
                    'valid_until' => $grant['validUntil'] ?? null,
                ]);
            }
        });

        $after = $this->directPermissionsOf($user);

        $this->audit(
            $user,
            self::CHANGE_PERMISSION_ASSIGN,
            ['permissions' => $before, 'actorId' => $actor->id],
            ['permissions' => $after],
            $reason
        );

        $this->cache->invalidate($user->company_code ?: null);

        return $after;
    }

    /** @return list<int> */
    public function roleIdsOf(User $user): array
    {
        if (!SchemaSupport::hasTable('user_roles')) {
            return [];
        }

        return DB::table('user_roles')->where('user_id', $user->id)->pluck('role_id')
            ->map(static fn ($id) => (int) $id)->values()->all();
    }

    /** @return list<array{permissionId:int,code:string,isDenied:bool}> */
    public function directPermissionsOf(User $user): array
    {
        if (!SchemaSupport::hasTable('user_permissions')) {
            return [];
        }

        return DB::table('user_permissions')
            ->join('permissions', 'permissions.id', '=', 'user_permissions.permission_id')
            ->where('user_permissions.user_id', $user->id)
            ->orderBy('permissions.name')
            ->get(['permissions.id', 'permissions.name', 'user_permissions.is_denied'])
            ->map(static fn ($row) => [
                'permissionId' => (int) $row->id,
                'code' => $row->name,
                'isDenied' => (bool) $row->is_denied,
            ])->all();
    }

    public function audit(User $user, string $changeType, ?array $old, ?array $new, ?string $reason = null): void
    {
        $request = request();

        if ($request) {
            AuditLogger::log($request, $changeType, self::MODULE, $old, array_merge($new ?? [], [
                'userId' => $user->id,
                'empCode' => $user->emp_code,
            ]));
        }

        if (!SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return;
        }

        DB::table('authorization_permission_audit_logs')->insert([
            'event_id' => (string) Str::uuid(),
            'tenant_id' => $user->company_code ?: null,
            'actor_id' => auth('api')->id(),
            'subject_type' => 'USER',
            'subject_id' => (string) $user->id,
            'subject_label' => trim(sprintf('%s%s', $user->name, $user->emp_code ? ' · ' . $user->emp_code : '')),
            'change_type' => $changeType,
            'old_values' => $old === null ? null : json_encode($old),
            'new_values' => $new === null ? null : json_encode($new),
            'business_reason' => $reason,
            'ip_address' => $request?->ip(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function history(User $user, int $limit = 25): array
    {
        if (!SchemaSupport::hasTable('authorization_permission_audit_logs')) {
            return [];
        }

        return DB::table('authorization_permission_audit_logs as a')
            ->leftJoin('users as actor', 'actor.id', '=', 'a.actor_id')
            ->where('a.subject_type', 'USER')
            ->where('a.subject_id', (string) $user->id)
            ->orderByDesc('a.created_at')
            ->limit($limit)
            ->get([
                'a.id', 'a.change_type', 'a.business_reason', 'a.old_values',
                'a.new_values', 'a.ip_address', 'a.created_at', 'actor.name as actor_name',
            ])
            ->map(static fn ($row) => [
                'id' => (int) $row->id,
                'changeType' => $row->change_type,
                'actorName' => $row->actor_name,
                'businessReason' => $row->business_reason,
                'oldValues' => $row->old_values ? json_decode($row->old_values, true) : null,
                'newValues' => $row->new_values ? json_decode($row->new_values, true) : null,
                'ipAddress' => $row->ip_address,
                'createdAt' => $row->created_at,
            ])->all();
    }

    public function activity(User $user, int $limit = 25): array
    {
        if (!SchemaSupport::hasTable('audit_logs')) {
            return [];
        }

        return DB::table('audit_logs')
            ->where('user_id', $user->id)
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get(['id', 'action', 'module', 'ip_address', 'created_at'])
            ->map(static fn ($row) => [
                'id' => (int) $row->id,
                'action' => $row->action,
                'module' => $row->module,
                'ipAddress' => $row->ip_address,
                'createdAt' => $row->created_at,
            ])->all();
    }

    public function loginHistory(User $user, int $limit = 25): array
    {
        $events = [];

        if (SchemaSupport::hasTable('login_events')) {
            $events = DB::table('login_events')
                ->where(function ($query) use ($user) {
                    $query->where('user_id', $user->id);

                    if ($user->email) {
                        $query->orWhere('email', $user->email);
                    }
                })
                ->orderByDesc('created_at')
                ->limit($limit)
                ->get(['id', 'result', 'reason', 'ip', 'user_agent', 'created_at'])
                ->map(static fn ($row) => [
                    'id' => (int) $row->id,
                    'result' => $row->result,
                    'reason' => $row->reason,
                    'ip' => $row->ip,
                    'userAgent' => $row->user_agent,
                    'createdAt' => $row->created_at,
                ])->all();
        }

        $sessions = [];

        if (SchemaSupport::hasTable('auth_sessions')) {
            $sessions = DB::table('auth_sessions')
                ->where('user_id', $user->id)
                ->orderByDesc('created_at')
                ->limit($limit)
                ->get(['id', 'ip', 'user_agent', 'device_label', 'last_seen_at', 'revoked_at', 'created_at'])
                ->map(static fn ($row) => [
                    'id' => (int) $row->id,
                    'ip' => $row->ip,
                    'userAgent' => $row->user_agent,
                    'deviceLabel' => $row->device_label,
                    'lastSeenAt' => $row->last_seen_at,
                    'revokedAt' => $row->revoked_at,
                    'createdAt' => $row->created_at,
                ])->all();
        }

        return ['events' => $events, 'sessions' => $sessions];
    }

    private function requireAdministrationColumns(): void
    {
        if (!$this->directory->supportsAdministration()) {
            throw new RuntimeException('The user administration columns are not present in this database.');
        }
    }

    private function fillable(array $data): array
    {
        return array_intersect_key($data, array_flip([
            'name', 'email', 'emp_code', 'mobile_number', 'department', 'designation',
            'branch', 'unit', 'company_code', 'joining_date', 'manager_name', 'dob',
            'gender', 'address', 'city', 'district', 'state', 'pin', 'photo',
        ]));
    }

    private function snapshot(User $user): array
    {
        $out = [];

        foreach (self::AUDITED_FIELDS as $field) {
            if (SchemaSupport::hasColumn('users', $field)) {
                $out[$field] = $user->getAttribute($field);
            }
        }

        return $out;
    }
}
