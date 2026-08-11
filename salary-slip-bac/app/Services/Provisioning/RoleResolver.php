<?php

namespace App\Services\Provisioning;

use App\Models\Role;
use App\Models\User;
use App\Services\Authorization\SchemaSupport;
use App\Support\ProvisioningContext;
use App\Support\RoleHierarchy;
use App\Support\SystemRoles;
use App\Support\UserTypeRoles;

/**
 * The one place that decides which roles a flow may assign.
 *
 * Two rules meet here and they are not the same rule. "May this actor grant
 * this role at all" is authorisation and belongs to RoleHierarchy. "Does this
 * role belong on this form" is product policy: Employee is a perfectly
 * assignable role that has no business being picked in the New User dialog,
 * because employees come from the Trial and Appointment forms with a company,
 * a unit and their documents attached.
 *
 * Both rules are applied to the list the browser renders AND to the request the
 * browser sends, from this class, so the two can never drift apart. A dropdown
 * that hides an option the server accepts is not a policy, it is a suggestion.
 */
class RoleResolver
{
    /**
     * Roles that exist only to be granted by a provisioning flow.
     *
     * Read from roles.is_direct_creatable when the column is present. The code
     * list is the fallback for a database that has not run the migration yet —
     * it is deliberately the canonical employee codes and nothing else, because
     * a deployment without the column must still refuse to mint employees from
     * the admin dialog rather than silently allowing what the flag forbids.
     */
    private const PROVISIONING_ONLY_CODES = ['employee', 'emp'];

    /** The canonical Employee role, or null in a deployment without one. */
    public function employeeRole(): ?Role
    {
        return UserTypeRoles::roleFor(UserTypeRoles::EMPLOYEE);
    }

    public function isEmployeeRole(?Role $role): bool
    {
        if ($role === null) {
            return false;
        }

        return UserTypeRoles::tierForCode($role->code) === UserTypeRoles::EMPLOYEE
            && in_array((string) $role->code, self::PROVISIONING_ONLY_CODES, true);
    }

    /**
     * May this role be the identity chosen when an account is typed in by hand?
     *
     * Never decided from the display name. A role renamed to "Staff" keeps the
     * code `emp` and stays out of the create dialog; a role named "Employee"
     * whose code is `hr_manager` is an ordinary assignable role.
     */
    public function isDirectCreatable(?Role $role): bool
    {
        if ($role === null) {
            return false;
        }

        /*
         * The canonical Employee codes are excluded by code, not by flag, and
         * the code wins.
         *
         * The flag alone was not enough. A migration can only stamp rows that
         * exist when it runs, and this deployment seeds its roles afterwards —
         * so on a fresh install the Employee role would be created later and
         * pick up the column's `true` default, quietly re-opening exactly what
         * the flag was added to close. The flag governs every other role, which
         * is what makes a custom role's participation a policy decision rather
         * than a code change.
         */
        if (in_array((string) $role->code, self::PROVISIONING_ONLY_CODES, true)) {
            return false;
        }

        if (SchemaSupport::hasColumn('roles', 'is_direct_creatable')) {
            return (bool) $role->getAttribute('is_direct_creatable');
        }

        return true;
    }

    public function isActive(?Role $role): bool
    {
        if ($role === null) {
            return false;
        }

        if (SchemaSupport::hasColumn('roles', 'status')
            && strtoupper((string) $role->getAttribute('status')) !== 'ACTIVE') {
            return false;
        }

        if (SchemaSupport::hasColumn('roles', 'is_active')
            && ! (bool) $role->getAttribute('is_active')) {
            return false;
        }

        return true;
    }

    /**
     * The options a dropdown may show for this context.
     *
     * @return list<array{value:string,label:string,tier:int,roleId:int,code:?string,hasRole:bool,isCurrent:bool,selectable:bool}>
     */
    public function options(?User $actor, string $context, ?User $target = null): array
    {
        $query = Role::query();

        if (SchemaSupport::hasColumn('roles', 'status')) {
            $query->where('status', 'ACTIVE');
        }

        if (SchemaSupport::hasColumn('roles', 'is_active')) {
            $query->where('is_active', true);
        }

        $out = [];
        $seen = [];

        foreach (SystemRoles::exclude($query)->orderBy('name')->get() as $role) {
            if (! $this->isVisibleTo($actor, $role)) {
                continue;
            }

            if ($context === ProvisioningContext::DIRECT_CREATE && ! $this->isDirectCreatable($role)) {
                continue;
            }

            $seen[$role->id] = true;
            $out[] = $this->option($role, false, true);
        }

        /*
         * The role the account already holds is always shown on the edit form,
         * even when it has been deactivated or is one this actor may not grant.
         * Omitting it does not protect anything — the assignment already exists
         * — it just makes the dropdown display the wrong current value, and the
         * first save silently rewrites an identity nobody meant to change.
         * `selectable` is false on those, so they can be displayed and not
         * chosen for anyone else.
         */
        if ($context === ProvisioningContext::EDIT_USER && $target !== null) {
            foreach ($this->rolesHeldBy($target) as $role) {
                if (isset($seen[$role->id])) {
                    continue;
                }

                $seen[$role->id] = true;
                $out[] = $this->option($role, true, false);
            }
        }

        return $out;
    }

    /**
     * Why this role may not be assigned here, or null when it may.
     *
     * Returns a [code, message, status] triple rather than throwing, so the
     * caller renders it in whatever envelope its endpoint already uses.
     *
     * @return array{0:string,1:string,2:int}|null
     */
    public function rejectionFor(?User $actor, ?Role $role, string $context): ?array
    {
        if ($role === null) {
            return ['ROLE_NOT_FOUND', 'That role does not exist.', 422];
        }

        if (! $this->isActive($role)) {
            return ['ROLE_INACTIVE', 'That role is not active and cannot be assigned.', 422];
        }

        if (SystemRoles::isProtected($role) || $role->getAttribute('is_hidden')) {
            return ['ROLE_ASSIGNMENT_FORBIDDEN', 'You do not have permission to assign this role.', 403];
        }

        if (! RoleHierarchy::canAssignRole($actor, $role)) {
            return ['ROLE_ASSIGNMENT_FORBIDDEN', 'You do not have permission to assign this role.', 403];
        }

        if ($context === ProvisioningContext::DIRECT_CREATE && ! $this->isDirectCreatable($role)) {
            return [
                'ROLE_NOT_DIRECT_CREATABLE',
                sprintf(
                    '%s accounts are created from the Trial or Appointment form, not from User Management.',
                    $role->name
                ),
                422,
            ];
        }

        return null;
    }

    /** The roles a user currently holds, most senior first. */
    public function rolesHeldBy(User $user): array
    {
        if (! SchemaSupport::hasTable('user_roles')) {
            return [];
        }

        try {
            return $user->roles()
                ->get()
                ->sortByDesc(fn (Role $role) => RoleHierarchy::rankOf($role))
                ->values()
                ->all();
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * A role is hidden from an actor who could never be allowed to grant it.
     *
     * The super administrator tier is filtered first and separately: it must not
     * appear even in a deployment whose hierarchy data is incomplete.
     */
    private function isVisibleTo(?User $actor, Role $role): bool
    {
        $tier = UserTypeRoles::tierForCode($role->code);

        if ($tier === UserTypeRoles::SUPER_ADMIN && (! $actor || (int) $actor->role !== UserTypeRoles::SUPER_ADMIN)) {
            return false;
        }

        return RoleHierarchy::canAssignRole($actor, $role);
    }

    private function option(Role $role, bool $isCurrent, bool $selectable): array
    {
        return [
            'value' => 'role:' . $role->id,
            'label' => $role->name,
            'tier' => UserTypeRoles::tierForCode($role->code),
            'roleId' => (int) $role->id,
            'code' => $role->code,
            'hasRole' => true,
            'isCurrent' => $isCurrent,
            'selectable' => $selectable,
        ];
    }
}
