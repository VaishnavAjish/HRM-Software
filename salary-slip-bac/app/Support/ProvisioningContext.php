<?php

namespace App\Support;

/**
 * Which flow is creating or changing an account.
 *
 * The context is decided by the route that was called, never by the request
 * body. That is the whole reason it exists: hiding the Employee role in the
 * dropdown stops an operator picking it, and stops nothing else. A hand-rolled
 * POST carrying that role id reaches the same controller, so the controller has
 * to know which door the request came through and apply the rule itself.
 */
class ProvisioningContext
{
    /** User Management → New User. Administrative and business accounts. */
    public const DIRECT_CREATE = 'direct_create';

    /** User Management → Edit. Every assignable role, including Employee. */
    public const EDIT_USER = 'edit_user';

    /** Trial form submission. The role is resolved by the server, not chosen. */
    public const TRIAL = 'trial';

    /** Appointment form submission. Same. */
    public const APPOINTMENT = 'appointment';

    /** Employee Management → Add Employee, and its bulk import. */
    public const EMPLOYEE_FORM = 'employee_form';

    public const IMPORT = 'import';

    /** Contexts a client may name on the assignable-roles endpoint. */
    public const SELECTABLE = [self::DIRECT_CREATE, self::EDIT_USER];

    public static function isSelectable(?string $context): bool
    {
        return in_array((string) $context, self::SELECTABLE, true);
    }
}
