<?php

namespace App\Support;

use App\Models\Role;

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

    /*
     * The dropdown itself now lives in RoleResolver.
     *
     * It had to move, because the list is no longer one list: Create and Edit
     * apply different policies to the same roles, and a builder that takes only
     * an actor cannot express that. What remains here is the tier mapping, which
     * is genuinely shared — RoleResolver and the legacy numeric column both read
     * it — and nothing that decides who may pick what.
     */

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

    /** Role ids owned by the type system, so other grants are left untouched. */
    public static function identityRoleIds(): array
    {
        $codes = array_merge(...array_values(self::CODES));

        return Role::query()->whereIn('code', $codes)->pluck('id')->all();
    }
}
