<?php

namespace App\Support;

use App\Models\Role;

/**
 * Which roles the platform refuses to let anyone dismantle, and why.
 *
 * Identity is a stable CODE, never the display name. "Super Admin" is editable
 * text; `super_administrator` is not. A role that merely calls itself
 * "Super Admin" gets no protection and grants no privilege — that separation is
 * the whole point, because a name check is bypassed by renaming a role.
 *
 * Two codes are recognised: `super_administrator`, which is what this database
 * uses, and `super_admin`, so a deployment seeded with the shorter code is
 * protected identically rather than silently unprotected.
 */
class ProtectedRoles
{
    public const SUPER_ADMIN_CODES = ['super_administrator', 'super_admin'];

    public static function isSuperAdminRole(?Role $role): bool
    {
        return $role !== null && in_array((string) $role->code, self::SUPER_ADMIN_CODES, true);
    }

    /**
     * Protected by explicit flag or by being the super administrator.
     *
     * The flag is checked with getAttribute so a database that has not run the
     * is_protected migration yet degrades to code-based protection rather than
     * throwing — the super administrator stays protected either way.
     */
    public static function isProtected(?Role $role): bool
    {
        if ($role === null) {
            return false;
        }

        return (bool) $role->getAttribute('is_protected') || self::isSuperAdminRole($role);
    }

    /** Codes a client is never allowed to create or rename a role into. */
    public static function isReservedCode(?string $code): bool
    {
        return in_array((string) $code, self::SUPER_ADMIN_CODES, true);
    }
}
