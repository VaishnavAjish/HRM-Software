<?php

namespace App\Support;

use App\Models\PermissionDimension;
use App\Models\Role;
use App\Models\User;

/**
 * Who may see a complete Aadhaar number.
 *
 * Everywhere else in the app the number is masked — `aadhar_card_no` is hidden
 * from every model serialisation and only `aadhaar_masked` is exposed. Revealing
 * the full value is a deliberate, audited action, so it needs its own grant
 * rather than riding on "can this person read appointments".
 *
 * Deny by default: a role with no explicit grant cannot reveal, and neither can
 * a role whose grant is set to no_access.
 */
class AadhaarAccess
{
    public const PERMISSION = 'appointments.view_full_aadhaar';

    /**
     * Employee-scoped equivalent. Either grant unlocks the full number on both
     * surfaces — one permission key per screen would let the two drift and
     * produce a viewer who can see an Aadhaar on one page but not another.
     */
    public const EMPLOYEE_PERMISSION = 'employees.view_full_aadhaar';

    /** Grants that count as permission to reveal. */
    private const ALLOWED_VALUES = ['view_only', 'read_write'];

    public static function allows(?User $actor): bool
    {
        if (! $actor) {
            return false;
        }

        // Super Admin. Role 1 (company admin) is deliberately not included:
        // seeing an Aadhaar has to be granted, not inherited from seniority.
        if ((int) $actor->role === 0) {
            return true;
        }

        $role = Role::where('name', 'User_'.$actor->id.'_Permissions')->first();

        if (! $role) {
            return false;
        }

        $value = PermissionDimension::where('role_id', $role->id)
            ->whereIn('key_name', [self::PERMISSION, self::EMPLOYEE_PERMISSION])
            ->whereIn('value', self::ALLOWED_VALUES)
            ->value('value');

        return $value !== null;
    }

    /**
     * Whether $actor may see $target's complete Aadhaar.
     *
     * Everyone owns their own identity documents, so viewing your own profile
     * needs no grant. Seeing somebody else's always does.
     */
    public static function allowsFor(?User $actor, ?User $target): bool
    {
        if (! $actor || ! $target) {
            return false;
        }

        if ((int) $actor->id === (int) $target->id) {
            return true;
        }

        return self::allows($actor);
    }

    /** Why access was granted, for the audit trail. */
    public static function basisFor(?User $actor, ?User $target): ?string
    {
        if (! $actor || ! $target) {
            return null;
        }

        if ((int) $actor->id === (int) $target->id) {
            return 'SELF';
        }

        return self::allows($actor) ? 'PERMISSION' : null;
    }
}
