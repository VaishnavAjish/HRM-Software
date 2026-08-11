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

    /**
     * Codes that map to a class. Everything else is CUSTOM.
     *
     * Both administrator codes and both employee codes are listed, because
     * deployments disagree about which they use and the omission is not a
     * cosmetic one. This database's administrator role is `admin`; the seeder's
     * is `tenant_administrator`. Only the second was listed, so on the live
     * schema the Admin role classified as CUSTOM at rank 30 instead of ADMIN at
     * rank 80 — and CUSTOM is a tier an administrator may manage. Three
     * consequences followed, all of them silent:
     *
     *   - an Admin could grant the Admin role to anybody, themselves included;
     *   - an Admin could edit the Admin role's own permission matrix, which is
     *     unbounded self-escalation: add any permission to the role you hold;
     *   - a user holding the Admin role whose legacy tier was not 1 classified
     *     as CUSTOM, so their peers could rewrite their roles.
     *
     * The existing test suite never caught it because RbacSeeder seeds
     * `tenant_administrator`, a code the production database does not contain.
     *
     * UserTypeRoles::CODES already listed both spellings for the same tier. Two
     * maps answering one question, and only one of them complete, is the whole
     * defect; they now agree.
     */
    private const CODE_CLASS = [
        'super_administrator' => self::INTERNAL_SUPER_ADMIN,
        'super_admin' => self::INTERNAL_SUPER_ADMIN,
        'tenant_administrator' => self::ADMIN,
        'admin' => self::ADMIN,
        'employee' => self::EMPLOYEE,
        'emp' => self::EMPLOYEE,
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

    /**
     * Codes that carry a tier by definition and may never be minted here.
     *
     * Creating a role whose code is `super_admin` would classify it
     * INTERNAL_SUPER_ADMIN through CODE_CLASS — a tier no request may
     * manufacture. `tenant_administrator` is reserved for the same reason at
     * the Admin tier. Uniqueness alone does not protect these: it only stops a
     * duplicate, so a code absent from a given deployment would be creatable.
     */
    public static function reservedCodes(): array
    {
        return array_keys(self::CODE_CLASS);
    }

    /**
     * Every code that carries a given class.
     *
     * So a query that needs to exclude a tier asks for its codes rather than
     * naming one. RoleManagementService listed `tenant_administrator` inline and
     * therefore failed to hide `admin` — the same omission as CODE_CLASS, in a
     * second place, which is what happens when the list is copied instead of
     * referenced.
     *
     * @return list<string>
     */
    public static function codesForClass(string $class): array
    {
        return array_keys(array_filter(
            self::CODE_CLASS,
            static fn (string $mapped) => $mapped === $class
        ));
    }

    /**
     * Compare codes the way a database would, after stripping the tricks.
     *
     * Unicode confusables and zero-width characters are removed, whitespace and
     * separators collapsed, then the result is casefolded. `ADMIN`, ` admin `,
     * `admin-`, and `super-administrator` all normalise onto their reserved
     * form so none of them slips past a naive string compare.
     */
    public static function normaliseCode(?string $code): string
    {
        $value = (string) $code;

        // Invisible formatting characters are removed outright — a zero-width
        // space inside "super_admin" is not a word break, it is a disguise.
        $value = preg_replace('/\p{Cf}/u', '', $value) ?? $value;

        // Whitespace and hyphens ARE word breaks, so they become the canonical
        // separator rather than vanishing: deleting them turned "super admin"
        // into "superadmin", which no longer matched the reserved code and let
        // the variant through.
        $value = preg_replace('/[\p{Zs}\s-]+/u', '_', $value) ?? $value;

        $value = preg_replace('/[^A-Za-z0-9_.]/u', '', $value) ?? $value;
        $value = preg_replace('/_+/', '_', $value) ?? $value;
        $value = trim($value, '_.');

        return mb_strtolower($value);
    }

    public static function isReservedCode(?string $code): bool
    {
        return in_array(self::normaliseCode($code), self::reservedCodes(), true);
    }

    /** May this actor create a role in this class? */
    public static function canCreateRoleClass(?User $actor, string $class): bool
    {
        if ($class === self::INTERNAL_SUPER_ADMIN) {
            return false;
        }

        return in_array($class, self::MANAGEABLE[self::actorClass($actor)] ?? [], true);
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

    /**
     * May this actor grant this role to somebody?
     *
     * Assignment is the same escalation as management by another route: handing
     * a user the administrator role gives them everything an administrator can
     * do, so it is gated on the same tier comparison rather than on a list of
     * role codes. A code list is what previously let this through — it named
     * super_administrator and security_administrator and simply omitted
     * tenant_administrator, so an administrator could grant the administrator
     * role, including to themselves.
     */
    public static function canAssignRole(?User $actor, ?Role $role): bool
    {
        if (! self::canManage($actor, $role)) {
            return false;
        }

        // Tier alone is not sufficient for granting.
        //
        // security_administrator carries no mapped code, so it classifies as
        // CUSTOM — a tier an administrator may manage. It is nonetheless a
        // SYSTEM role holding the security permission set, and the deny-list
        // this check replaced blocked it by name. Keying on the is_system and
        // is_sensitive flags restores that protection and generalises it to any
        // sensitive role, rather than to the two codes someone remembered.
        if ($actor !== null && $actor->isSuperAdmin()) {
            return true;
        }

        return ! (bool) $role->getAttribute('is_system')
            && ! (bool) $role->getAttribute('is_sensitive');
    }

    /**
     * The tier of the highest role a user holds.
     *
     * Highest, not first: a user carrying both Employee and Admin is an
     * administrator, and reading whichever row the database returned first
     * would classify them as an employee and expose them to modification by
     * their peers. The account's own super-admin flag outranks any role row.
     */
    public static function userClass(?User $user): string
    {
        if ($user === null) {
            return self::CUSTOM;
        }

        if ($user->isSuperAdmin()) {
            return self::INTERNAL_SUPER_ADMIN;
        }

        $highest = self::CUSTOM;
        $highestRank = -1;

        try {
            foreach ($user->roles()->get() as $role) {
                $class = self::classOf($role);
                $rank = self::RANKS[$class] ?? 0;
                if ($rank > $highestRank) {
                    $highestRank = $rank;
                    $highest = $class;
                }
            }
        } catch (\Throwable) {
            // No pivot table — fall through to the numeric role below.
        }

        if ((self::RANKS[$highest] ?? 0) < self::RANKS[self::ADMIN] && (int) $user->role === 1) {
            return self::ADMIN;
        }

        return $highest;
    }

    /**
     * May this actor change this user's roles at all?
     *
     * Guards the subject as well as the grant. Without it an administrator
     * blocked from granting the administrator role could still strip it from a
     * peer, or demote them, which is the same boundary crossed in the opposite
     * direction.
     */
    public static function canManageUserRoles(?User $actor, ?User $target): bool
    {
        if ($actor === null || $target === null) {
            return false;
        }

        // Nobody edits their own tier here. Changing your own roles is how a
        // single request turns into self-promotion.
        if ((int) $actor->id === (int) $target->id) {
            return false;
        }

        return in_array(self::userClass($target), self::MANAGEABLE[self::actorClass($actor)] ?? [], true);
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
