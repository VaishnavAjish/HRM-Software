<?php

namespace App\Support;

use App\Models\Role;
use App\Models\User;

/**
 * Who may manage which roles.
 *
 * The rule is a rank comparison, not a permission check. Every other surface in
 * this application asks "does the caller hold admin.role.update?"; that question
 * is wrong here, because the thing being edited IS the permission system. A
 * caller who can grant themselves a role-management permission can then grant
 * themselves everything, so a permission check on this surface authorises its
 * own escalation. Rank cannot be granted by editing a role.
 *
 * Classification is derived from the immutable role CODE, never the display
 * name. "Admin" is editable text; `tenant_administrator` is not. Renaming a
 * role therefore changes nothing about what it may manage — which is the whole
 * point, because a name check is bypassed by renaming.
 */
class RoleHierarchy
{
    public const INTERNAL_SUPER_ADMIN = 'INTERNAL_SUPER_ADMIN';
    public const ADMIN = 'ADMIN';
    public const EMPLOYEE = 'EMPLOYEE';
    public const VIEWER = 'VIEWER';
    public const CUSTOM = 'CUSTOM';

    /** Higher rank manages lower rank. Equal rank manages nothing. */
    public const RANKS = [
        self::INTERNAL_SUPER_ADMIN => 100,
        self::ADMIN => 80,
        self::EMPLOYEE => 20,
        self::VIEWER => 10,
        self::CUSTOM => 30,
    ];

    /** Codes that map to a class. Everything else is CUSTOM. */
    private const CODE_CLASS = [
        'super_administrator' => self::INTERNAL_SUPER_ADMIN,
        'super_admin' => self::INTERNAL_SUPER_ADMIN,
        'tenant_administrator' => self::ADMIN,
        'employee' => self::EMPLOYEE,
        'viewer' => self::VIEWER,
    ];

    /** What each acting class may create and manage. */
    public const MANAGEABLE = [
        self::INTERNAL_SUPER_ADMIN => [self::ADMIN, self::EMPLOYEE, self::VIEWER, self::CUSTOM],
        self::ADMIN => [self::EMPLOYEE, self::VIEWER, self::CUSTOM],
        self::EMPLOYEE => [],
        self::VIEWER => [],
        self::CUSTOM => [],
    ];

    public static function classOf(?Role $role): string
    {
        if ($role === null) {
            return self::CUSTOM;
        }

        // The CODE decides, and it decides first. role_class is a stored
        // convenience for querying, not the source of truth: it carries a
        // column default, so a role created after the migration — by a seeder,
        // a fixture, or any insert that omits it — reads as CUSTOM while
        // actually being the administrator. Deriving from the code makes the
        // classification impossible to get wrong by forgetting a field, and
        // impossible to escalate by writing one.
        $known = self::CODE_CLASS[(string) $role->code] ?? null;
        if ($known !== null) {
            return $known;
        }

        // Only for codes with no canonical mapping does the stored value apply,
        // and then only if it names a tier we recognise — an arbitrary string
        // must not be able to invent one.
        $stored = (string) $role->getAttribute('role_class');
        if ($stored !== '' && array_key_exists($stored, self::RANKS)) {
            // A stored class may never claim the internal identity; that tier
            // is reachable only through the protected code.
            return $stored === self::INTERNAL_SUPER_ADMIN ? self::CUSTOM : $stored;
        }

        return self::CUSTOM;
    }

    public static function rankOf(?Role $role): int
    {
        return self::RANKS[self::classOf($role)] ?? 0;
    }

    /**
     * The acting user's class.
     *
     * Super admin comes from the account (numeric role 0 / is_super_admin),
     * never from an assigned role row, so it survives any role edit. Admin is
     * recognised from the assigned role codes or the legacy numeric role 1.
     */
    public static function actorClass(?User $actor): string
    {
        if ($actor === null) {
            return self::CUSTOM;
        }

        if ($actor->isSuperAdmin()) {
            return self::INTERNAL_SUPER_ADMIN;
        }

        $codes = self::actorRoleCodes($actor);
        foreach ($codes as $code) {
            if ((self::CODE_CLASS[$code] ?? null) === self::ADMIN) {
                return self::ADMIN;
            }
        }

        if ((int) $actor->role === 1) {
            return self::ADMIN;
        }

        foreach ($codes as $code) {
            if ((self::CODE_CLASS[$code] ?? null) === self::VIEWER) {
                return self::VIEWER;
            }
        }

        return (int) $actor->role === 3 ? self::EMPLOYEE : self::CUSTOM;
    }

    /** @return list<string> */
    private static function actorRoleCodes(User $actor): array
    {
        try {
            return $actor->roles()->pluck('code')->map('strval')->all();
        } catch (\Throwable) {
            // A deployment without the pivot must not hard-fail authorisation;
            // it degrades to the numeric role, which is more restrictive.
            return [];
        }
    }

    public static function canAccessRoleManagement(?User $actor): bool
    {
        return self::MANAGEABLE[self::actorClass($actor)] !== [];
    }

    /** Classes this actor may create. */
    public static function creatableClasses(?User $actor): array
    {
        return self::MANAGEABLE[self::actorClass($actor)] ?? [];
    }

    /**
     * The single decision every role mutation goes through.
     *
     * The hidden super administrator is never a valid target: it is not
     * manageable through this surface by anyone, the acting super admin
     * included, because deactivating or deleting it locks everyone out
     * permanently and this surface is the only way back.
     */
    public static function canManage(?User $actor, ?Role $target): bool
    {
        if ($actor === null || $target === null) {
            return false;
        }

        $targetClass = self::classOf($target);

        if ($targetClass === self::INTERNAL_SUPER_ADMIN || SystemRoles::isProtected($target)) {
            return false;
        }

        if (ProtectedRoles::isProtected($target)) {
            return false;
        }

        return in_array($targetClass, self::MANAGEABLE[self::actorClass($actor)] ?? [], true);
    }

    /** Capability flags for the browser. Never the internal class itself. */
    public static function capabilities(?User $actor): array
    {
        $creatable = self::creatableClasses($actor);

        return [
            'canAccess' => self::canAccessRoleManagement($actor),
            'canCreateAdmin' => in_array(self::ADMIN, $creatable, true),
            'canCreateEmployee' => in_array(self::EMPLOYEE, $creatable, true),
            'canCreateViewer' => in_array(self::VIEWER, $creatable, true),
            'canCreateCustom' => in_array(self::CUSTOM, $creatable, true),
            'canManageAdmin' => in_array(self::ADMIN, $creatable, true),
            'canManageLowerRoles' => $creatable !== [],
            'creatableClasses' => array_values($creatable),
        ];
    }
}
