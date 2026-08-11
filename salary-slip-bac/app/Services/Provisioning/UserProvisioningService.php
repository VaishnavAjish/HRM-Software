<?php

namespace App\Services\Provisioning;

use App\Models\Role;
use App\Models\User;
use App\Services\Admin\UserAccountService;
use App\Services\Authorization\SchemaSupport;
use App\Support\CompanyMembership;
use App\Support\ProvisioningContext;
use App\Support\UserTypeRoles;
use Illuminate\Support\Facades\DB;

/**
 * Every way an account comes into existence, funnelled through one core.
 *
 * There are five doors into the users table — the admin dialog, the employee
 * form, its bulk import, the trial form and the appointment form — and they
 * agreed on almost nothing. The admin dialog assigned an RBAC role; the other
 * four wrote users.role and stopped, so an employee provisioned from an
 * appointment had a numeric tier and no canonical role at all, which is why the
 * Permission Matrix listed accounts holding nothing. Company membership was
 * written by none of them.
 *
 * The doors stay separate, because they genuinely are: only one of them lets an
 * operator choose a role, and only one of them must refuse Employee. What is
 * shared is what happens after the choice — resolve the role, persist, assign
 * identity, sync companies, stamp the source, audit — and that is this class.
 *
 * The context is a constructor-style argument on each method rather than a field
 * on the request, so it is decided by which method the controller called. A
 * value the client can set is not a rule, and the rule this enforces —
 * Employee is not directly creatable — is worth nothing if the client picks the
 * context it is checked against.
 */
class UserProvisioningService
{
    public function __construct(
        private readonly UserAccountService $accounts,
        private readonly RoleAssignmentService $assignments,
        private readonly RoleResolver $roles,
        private readonly CompanyMembershipService $companies,
        private readonly UnitMembershipService $units,
    ) {
    }

    /**
     * User Management → New User.
     *
     * @param array $data payload from StoreUserRequest, plus roleId/companyIds
     *
     * @throws ProvisioningException
     */
    public function createDirectUser(array $data, User $actor): User
    {
        $role = $this->requireAssignableRole(
            $actor,
            $this->identityRoleFrom($data),
            ProvisioningContext::DIRECT_CREATE
        );

        $companyIds = $this->requireCompanies($actor, $data);
        $unitIds = $this->units->requireWithinCompanies((array) ($data['unitIds'] ?? []), $companyIds);

        return DB::transaction(function () use ($data, $actor, $role, $companyIds, $unitIds) {
            $data['role'] = UserTypeRoles::tierForCode($role->code);
            $data['company_code'] = $companyIds === []
                ? ($data['company_code'] ?? '')
                : CompanyMembership::serialize($this->companies->codesForIds($companyIds));

            // The identity is assigned below from the resolved role, so the raw
            // roleIds list is not replayed here — that is what allowed the
            // dropdown and the checkboxes to write two different identities.
            unset($data['roleIds'], $data['unitIds']);

            $user = $this->accounts->create($data, $actor);

            $this->stampSource($user, ProvisioningContext::DIRECT_CREATE);
            $this->assignments->syncIdentity($user, $role, $actor, $data['businessReason'] ?? 'Created with the account');

            if ($companyIds !== []) {
                $this->companies->sync($user, $companyIds);
            } else {
                $this->companies->syncFromLegacyCode($user);
            }

            if ($unitIds !== []) {
                $this->units->sync($user, $unitIds, $this->primaryUnitFrom($data));
            }

            return $user;
        });
    }

    /**
     * User Management → Edit.
     *
     * Role, companies and employment details move together or not at all. A
     * promotion that commits the role and then fails the company sync leaves an
     * administrator scoped to nothing, which reads as a broken account rather
     * than a failed save.
     *
     * Absent fields are absent, not empty: a payload that says nothing about
     * companies must leave membership exactly as it was, or every role change
     * would quietly unscope the account.
     *
     * @throws ProvisioningException
     */
    public function updateUser(User $user, array $data, User $actor): User
    {
        $role = null;

        if ($this->mentionsIdentity($data)) {
            $role = $this->requireAssignableRole(
                $actor,
                $this->identityRoleFrom($data),
                ProvisioningContext::EDIT_USER
            );
        }

        $companyIds = array_key_exists('companyIds', $data) && is_array($data['companyIds'])
            ? $this->requireCompanies($actor, $data)
            : null;

        // Units are validated against the companies the account will have after
        // this save, not the ones it had before — otherwise removing a company
        // and keeping its unit in the same request would pass.
        $effectiveCompanyIds = $companyIds ?? $this->companies->companyIdsOf($user);

        $unitIds = array_key_exists('unitIds', $data) && is_array($data['unitIds'])
            ? $this->units->requireWithinCompanies($data['unitIds'], $effectiveCompanyIds)
            : null;

        return DB::transaction(function () use ($user, $data, $actor, $role, $companyIds, $unitIds, $effectiveCompanyIds) {
            if ($role !== null) {
                $data['role'] = UserTypeRoles::tierForCode($role->code);
            }

            if ($companyIds !== null && $companyIds !== []) {
                $data['company_code'] = CompanyMembership::serialize(
                    $this->companies->codesForIds($companyIds)
                );
            }

            unset($data['companyIds'], $data['unitIds'], $data['roleId'], $data['roleIds']);

            $this->accounts->update($user, $data, $actor);

            if ($role !== null) {
                $this->assignments->syncIdentity($user, $role, $actor, $data['businessReason'] ?? 'Role changed');
            }

            if ($companyIds !== null && $companyIds !== []) {
                $this->companies->sync($user, $companyIds);
            }

            if ($unitIds !== null) {
                $this->units->sync($user, $unitIds, $this->primaryUnitFrom($data));
            } elseif ($companyIds !== null) {
                /*
                 * Dropping a company drops its units with it.
                 *
                 * The browser clears them from the checkbox list, and that is
                 * cosmetic — a save that changes companies without mentioning
                 * units would otherwise leave the account holding a unit inside
                 * a company it no longer belongs to.
                 */
                $survivors = array_values(array_intersect(
                    $this->units->unitIdsOf($user),
                    array_column($this->units->optionsForCompanies($effectiveCompanyIds), 'id')
                ));

                // The primary is kept when it survived the company change; when
                // it did not, the caller is not asked mid-request — the first
                // surviving unit takes over, and the form shows the result.
                $primary = $this->units->primaryUnitIdOf($user);

                $this->units->sync(
                    $user,
                    $survivors,
                    in_array($primary, $survivors, true) ? $primary : ($survivors[0] ?? null)
                );
            }

            return $user;
        });
    }

    /**
     * A trial form or an appointment has produced an employee record.
     *
     * The role is not a parameter. Both forms are submissions about a person and
     * neither carries an authorization decision, so accepting one from the
     * request would make the browser the arbiter of who is an administrator.
     */
    public function provisionEmployee(User $user, string $source, ?User $actor = null): void
    {
        DB::transaction(function () use ($user, $source, $actor) {
            $this->stampSource($user, $source);
            $this->assignments->assignCanonicalEmployee($user, $actor);
            $this->companies->syncFromLegacyCode($user);
        });
    }

    /**
     * The employee form and its bulk import, which do carry a tier.
     *
     * Those surfaces predate the role picker and still post users.role, so the
     * canonical role is derived from the tier rather than chosen. Deriving it is
     * the point: before this, the tier was all they wrote.
     */
    public function provisionFromTier(User $user, string $source, ?User $actor = null): void
    {
        DB::transaction(function () use ($user, $source, $actor) {
            $this->stampSource($user, $source);
            $this->assignments->syncIdentity(
                $user,
                $this->assignments->roleForTier($user->role),
                $actor,
                'Provisioned by ' . $source
            );
            $this->companies->syncFromLegacyCode($user);
        });
    }

    /** Bulk import: one transaction for the batch, not one per row. */
    public function provisionManyFromTier(array $userIds, string $source, ?User $actor = null): void
    {
        if ($userIds === []) {
            return;
        }

        DB::transaction(function () use ($userIds, $source, $actor) {
            foreach (User::query()->whereIn('id', $userIds)->cursor() as $user) {
                $this->stampSource($user, $source);
                $this->assignments->syncIdentity(
                    $user,
                    $this->assignments->roleForTier($user->role),
                    $actor,
                    'Provisioned by ' . $source
                );
                $this->companies->syncFromLegacyCode($user);
            }
        });
    }

    /**
     * The role an identity payload selects.
     *
     * roleId is canonical and wins. The legacy tier is honoured only when no
     * role id was sent, so an older client keeps working — but the tier is never
     * allowed to override an explicit choice, which is how "User type = Admin"
     * and "roles = [EMP]" used to end up on the same account.
     */
    private function identityRoleFrom(array $data): ?Role
    {
        if (! empty($data['roleId'])) {
            return Role::query()->find((int) $data['roleId']);
        }

        if (! empty($data['roleIds']) && is_array($data['roleIds'])) {
            return Role::query()->find((int) $data['roleIds'][0]);
        }

        if (array_key_exists('role', $data) && $data['role'] !== null) {
            return $this->assignments->roleForTier($data['role']);
        }

        return null;
    }

    private function primaryUnitFrom(array $data): ?int
    {
        return empty($data['primaryUnitId']) ? null : (int) $data['primaryUnitId'];
    }

    private function mentionsIdentity(array $data): bool
    {
        return ! empty($data['roleId'])
            || ! empty($data['roleIds'])
            || (array_key_exists('role', $data) && $data['role'] !== null);
    }

    /** @throws ProvisioningException */
    private function requireAssignableRole(User $actor, ?Role $role, string $context): Role
    {
        if ($role === null) {
            throw new ProvisioningException(
                'ROLE_REQUIRED',
                'Select the user type for this account.',
                422
            );
        }

        if ($rejection = $this->roles->rejectionFor($actor, $role, $context)) {
            throw ProvisioningException::fromRejection($rejection);
        }

        return $role;
    }

    /**
     * Company ids the actor is actually allowed to file this account into.
     *
     * Validated against the actor's own scope rather than against the companies
     * table alone: existence is not permission, and an id typed into a request
     * is exactly how an administrator of one company would otherwise create
     * accounts inside another.
     *
     * @return list<int>
     * @throws ProvisioningException
     */
    private function requireCompanies(User $actor, array $data): array
    {
        $requested = array_values(array_unique(array_map(
            'intval',
            (array) ($data['companyIds'] ?? [])
        )));

        if ($requested === []) {
            return [];
        }

        if (! $this->companies->available()) {
            throw new ProvisioningException(
                'COMPANY_MODULE_NOT_READY',
                'Company records are not present in this database yet.',
                503
            );
        }

        $allowed = array_column($this->companies->optionsFor($actor), 'id');
        $outside = array_diff($requested, $allowed);

        if ($outside !== []) {
            throw new ProvisioningException(
                'PERMISSION_DENIED',
                'One of those companies is outside the companies you administer.',
                403
            );
        }

        return $requested;
    }

    private function stampSource(User $user, string $source): void
    {
        if (! SchemaSupport::hasColumn('users', 'provisioning_source')) {
            return;
        }

        if ($user->provisioning_source === $source) {
            return;
        }

        $user->provisioning_source = $source;
        $user->save();
    }
}
