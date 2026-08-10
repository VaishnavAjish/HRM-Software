<?php

namespace App\Support;

use App\Models\Role;
use App\Services\Authorization\SchemaSupport;

/**
 * The single mapping between a user's type and the RBAC role it grants.
 *
 * These were two answers to one question. `users.role` is a small integer set on
 * every one of the 343 accounts; `user_roles` is the RBAC assignment, and only
 * three accounts had one. Meanwhile the roles table carried rows named "admin",
 * "EMP" and "Super Admin" — the same tiers the integer already encoded, spelled
 * differently. Offering both on the create form let an operator pick Employee
 * and tick "admin", after which the account's real authority depended on which
 * check happened to run.
 *
 * The type is now authoritative and the role assignment is derived from it, so
 * the two cannot disagree. Extra roles that genuinely are not identities — HR
 * Manager, ACC — remain grantable through the separate assign-role operation.
 */
class UserTypeRoles
{
    public const SUPER_ADMIN = 0;
    public const ADMIN = 1;
    public const UNIT_ADMIN = 2;
    public const EMPLOYEE = 3;
    public const AGENT = 4;

    /** Display name for each type. The UI never shows the raw integer or code. */
    public const LABELS = [
        self::SUPER_ADMIN => 'Super Admin',
        self::ADMIN => 'Admin',
        self::UNIT_ADMIN => 'Unit Admin',
        self::EMPLOYEE => 'Employee',
        self::AGENT => 'Agent',
    ];

    /**
     * Role codes each type maps onto, most preferred first.
     *
     * More than one code per type because deployments disagree: this database
     * calls the administrator role `admin`, the seeder calls it
     * `tenant_administrator`, and both are legitimate. The first code that
     * exists wins, so the mapping survives either.
     */
    private const CODES = [
        self::SUPER_ADMIN => ['super_administrator', 'super_admin'],
        self::ADMIN => ['tenant_administrator', 'admin'],
        self::UNIT_ADMIN => ['unit_administrator', 'unit_admin'],
        self::EMPLOYEE => ['employee', 'emp'],
        self::AGENT => ['agent'],
    ];

    public static function isValid(int|string|null $type): bool
    {
        return array_key_exists((int) $type, self::LABELS);
    }

    public static function label(int|string|null $type): string
    {
        return self::LABELS[(int) $type] ?? 'Unknown';
    }

    public static function types(): array
    {
        $out = [];

        foreach (self::LABELS as $value => $label) {
            $out[] = ['value' => $value, 'label' => $label];
        }

        return $out;
    }

    /** The role this type grants, or null when the deployment has no such row. */
    public static function roleFor(int|string|null $type): ?Role
    {
        foreach (self::CODES[(int) $type] ?? [] as $code) {
            $role = Role::query()->where('code', $code)->first();

            if ($role !== null) {
                return $role;
            }
        }

        return null;
    }

    /**
     * The User type dropdown: canonical tiers plus every other active role.
     *
     * A union, not one or the other. Listing only the roles table would drop
     * Unit Admin and Agent — tiers with live accounts but no role row — so they
     * could no longer be created. Listing only the canonical five hides real
     * roles like HR Manager, which is the duplication this work set out to end.
     *
     * `tier` is always derived from the role CODE, never the display name. A row
     * named "Admin" whose code is `emp` therefore creates an employee, and says
     * so, rather than quietly minting an administrator.
     */
    /**
     * The User type dropdown: exactly the roles the Roles page lists.
     *
     * Same query, same visibility rules, same records — because User type IS
     * role selection, and two lists built from different sources will disagree.
     * They did: this returned the five canonical tiers unioned with the roles
     * table, so the dropdown offered six options while the Roles page showed
     * two, and three of those six had no role behind them at all.
     *
     * The consequence is deliberate. A tier with no role row — Unit Admin and
     * Agent here — is not offered, because there is nothing to assign. Creating
     * the role is what makes the type available, which is the point.
     *
     * `tier` still comes from the role CODE, never the display name, so a row
     * named "Admin" whose code is `emp` sets the employee tier.
     */
    public static function options(?\App\Models\User $actor = null): array
    {
        $query = Role::query();

        if (SchemaSupport::hasColumn('roles', 'status')) {
            $query->where('status', 'ACTIVE');
        }

        if (SchemaSupport::hasColumn('roles', 'is_active')) {
            $query->where('is_active', true);
        }

        $out = [];

        foreach (SystemRoles::exclude($query)->orderBy('name')->get() as $role) {
            $tier = self::tierForCode($role->code);

            // The protected identity is never listed, and no ordinary actor may
            // mint one. The backend guard rejects it regardless of this filter.
            if ($tier === self::SUPER_ADMIN && $actor !== null && (int) $actor->role !== self::SUPER_ADMIN) {
                continue;
            }

            $out[] = [
                'value' => 'role:' . $role->id,
                'label' => $role->name,
                'tier' => $tier,
                'roleId' => $role->id,
                'code' => $role->code,
                'hasRole' => true,
            ];
        }

        return $out;
    }

    /** Numeric tier a role code belongs to. Unknown codes are ordinary staff. */
    public static function tierForCode(?string $code): int
    {
        foreach (self::CODES as $tier => $codes) {
            if (in_array((string) $code, $codes, true)) {
                return $tier;
            }
        }

        return self::EMPLOYEE;
    }

    /** Resolve a dropdown value back into the tier and role it selects. */
    public static function resolve(?string $value): array
    {
        foreach (self::options() as $option) {
            if ($option['value'] === $value) {
                return ['tier' => $option['tier'], 'roleId' => $option['roleId']];
            }
        }

        return ['tier' => self::EMPLOYEE, 'roleId' => null];
    }

    /** Role ids owned by the type system, so other grants are left untouched. */
    public static function identityRoleIds(): array
    {
        $codes = array_merge(...array_values(self::CODES));

        return Role::query()->whereIn('code', $codes)->pluck('id')->all();
    }
}
