<?php

namespace App\Support;

use App\Models\User;
use App\Services\Documents\DocumentAuthorizer;

/**
 * Who may see a complete Aadhaar number.
 *
 * The rule is record access: if you are allowed to open an employee or
 * appointment record, you see its Aadhaar in full. There is no second gate and no
 * masked variant of an authorised page.
 *
 * That is a deliberate reversal of the earlier design, which required
 * `appointments.view_full_aadhaar` on top of record access. Two gates produced a
 * worse outcome in practice: the same number appeared masked on one screen and
 * complete on another, users could not tell a missing field from a withheld one,
 * and the masked variants were treated as a security control when anyone holding
 * record access could read the number from the details endpoint anyway.
 *
 * What still gates disclosure, unchanged:
 *
 *  - authentication — an unauthenticated request gets nothing;
 *  - organisation, company and unit scope via DocumentAuthorizer::canAccessOwner,
 *    so a company admin cannot reach another company's records and a manager
 *    cannot reach another unit's;
 *  - route middleware, which refuses plain employees on admin endpoints before
 *    disclosure is even considered.
 *
 * The permission constants remain: they are registered in the RBAC registry and
 * AadhaarExportAccess still uses its own separate keys for audited export.
 */
class AadhaarAccess
{
    /**
     * Retained for the RBAC registry and for existing grants. No longer consulted
     * when deciding whether to disclose a number for display — record access is.
     */
    public const PERMISSION = 'appointments.view_full_aadhaar';

    public const EMPLOYEE_PERMISSION = 'employees.view_full_aadhaar';

    /**
     * Whether $actor may see $target's complete Aadhaar.
     *
     * Everyone owns their own identity documents, so your own profile always
     * qualifies. Everything else is the ordinary record-scope check.
     */
    public static function allowsFor(?User $actor, ?User $target): bool
    {
        if (! $actor || ! $target) {
            return false;
        }

        if ((int) $actor->id === (int) $target->id) {
            return true;
        }

        return DocumentAuthorizer::canAccessOwner($actor, $target);
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

        return DocumentAuthorizer::canAccessOwner($actor, $target) ? 'RECORD_ACCESS' : null;
    }
}
