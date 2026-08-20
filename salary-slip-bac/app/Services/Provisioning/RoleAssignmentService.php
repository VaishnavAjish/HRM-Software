<?php

namespace App\Services\Provisioning;

use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\SchemaSupport;
use App\Support\UserTypeRoles;
use Illuminate\Support\Facades\DB;

/**
 * The one write path for a user's identity role.
 *
 * Every flow that decides "this account is an Admin" or "this account is an
 * Employee" ends up here, whether the decision was typed into a dropdown or
 * resolved by the server from a trial form. Direct create, edit, trial,
 * appointment and the employee form previously each had their own answer, and
 * three of them had no answer at all — the account got users.role and no RBAC
 * assignment, so the Permission Matrix showed an employee with no role.
 *
 * Identity is one role. Extra grants — HR Manager on top of Employee, ACC on top
 * of Admin — are a different operation (assign-role) and survive an identity
 * change untouched, because revoking capability nobody asked to revoke turns an
 * unrelated edit into an access incident.
 *
 * Which assignments count as identity is recorded, not guessed:
 * authorization_role_assignments.assignment_source is stamped IDENTITY here.
 * Without that the only removable set would be the five canonical tier codes,
 * so a user created as HR Manager and later changed to Admin would keep HR
 * Manager forever — the identity would accumulate instead of change.
 */
class RoleAssignmentService
{
    public const SOURCE_IDENTITY = 'IDENTITY';

    public function __construct(
        private readonly RoleResolver $roles,
        private readonly AuthorizationCache $cache,
    ) {
    }

    /**
     * Make $target the account's identity role, keeping every other grant.
     *
     * A null target means the deployment has no role for this tier. The existing
     * identity is still cleared: leaving the old one attached would make the
     * change look applied while the account kept its previous authority.
     */
    public function syncIdentity(User $user, ?Role $target, ?User $actor = null, ?string $reason = null): void
    {
        if (! SchemaSupport::hasTable('user_roles')) {
            return;
        }

        $identityIds = $this->identityRoleIdsFor($user);

        $keep = $user->roles()->pluck('roles.id')
            ->map(static fn ($id) => (int) $id)
            ->reject(fn (int $id) => in_array($id, $identityIds, true))
            ->all();

        if ($target !== null) {
            $keep[] = (int) $target->id;
        }

        $user->roles()->sync(array_values(array_unique($keep)));

        if ($target !== null) {
            $tier = UserTypeRoles::tierForCode($target->code);
            $user->role = $tier;
            if (in_array($tier, [UserTypeRoles::SUPER_ADMIN, UserTypeRoles::ADMIN, UserTypeRoles::UNIT_ADMIN], true) && $user->type === 'agent') {
                $user->type = null;
            }
            $user->save();
        }

        $this->recordAssignments($user, $target, $actor, $reason);
        $this->cache->invalidate($user->company_code ?: null);
    }

    /**
     * Give this account the canonical Employee role.
     *
     * The role is resolved here, never taken from the request. A trial form and
     * an appointment form are submissions about a person, not statements about
     * authorization, and the browser has no business naming a role id in either.
     */
    public function assignCanonicalEmployee(User $user, ?User $actor = null): void
    {
        $this->syncIdentity($user, $this->roles->employeeRole(), $actor, 'Employee provisioning');
    }

    /** The role this legacy tier maps onto, for flows that still carry one. */
    public function roleForTier(int|string|null $tier): ?Role
    {
        return UserTypeRoles::roleFor($tier);
    }

    /**
     * Ids that represent "who this account is" rather than "what it may also do".
     *
     * The canonical tier codes, plus anything this service itself stamped as the
     * identity. @return list<int>
     */
    private function identityRoleIdsFor(User $user): array
    {
        $ids = UserTypeRoles::identityRoleIds();

        if (! SchemaSupport::hasTable('authorization_role_assignments')) {
            return array_values(array_unique(array_map('intval', $ids)));
        }

        $stamped = DB::table('authorization_role_assignments')
            ->where('user_id', $user->id)
            ->where('assignment_source', self::SOURCE_IDENTITY)
            ->pluck('role_id')
            ->map(static fn ($id) => (int) $id)
            ->all();

        return array_values(array_unique(array_merge(array_map('intval', $ids), $stamped)));
    }

    private function recordAssignments(User $user, ?Role $target, ?User $actor, ?string $reason): void
    {
        if (! SchemaSupport::hasTable('authorization_role_assignments')) {
            return;
        }

        $query = DB::table('authorization_role_assignments')
            ->where('user_id', $user->id)
            ->where('assignment_source', self::SOURCE_IDENTITY);

        if ($target !== null) {
            $query->where('role_id', '!=', $target->id);
        }

        $query->update(['status' => 'REVOKED', 'updated_at' => now()]);

        if ($target === null) {
            return;
        }

        DB::table('authorization_role_assignments')->updateOrInsert(
            [
                'user_id' => $user->id,
                'role_id' => $target->id,
                'tenant_id' => $user->company_code ?: null,
                'scope_type' => 'TENANT',
                'scope_id' => $user->company_code ?: null,
            ],
            [
                'valid_from' => now(),
                'assignment_source' => self::SOURCE_IDENTITY,
                'assignment_reason' => $reason,
                'assigned_by' => $actor?->id,
                'status' => 'ACTIVE',
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );
    }
}
