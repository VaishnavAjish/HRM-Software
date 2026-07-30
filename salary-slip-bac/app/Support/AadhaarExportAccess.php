<?php

namespace App\Support;

use App\Models\PermissionDimension;
use App\Models\Role;
use App\Models\User;

/**
 * Who may take a complete Aadhaar number *out of* the application.
 *
 * Deliberately separate from AadhaarAccess. Being allowed to read a number on
 * screen is not the same as being allowed to put it on paper or in a file: a
 * screen view ends when the tab closes, whereas a printed sheet and a downloaded
 * PDF leave this application's control permanently and can never be recalled.
 * So `appointments.view_full_aadhaar` grants nothing here, and Print and PDF are
 * two further separate grants rather than one "export" permission — an operator
 * who needs paper for a file does not automatically get a copyable digital file.
 *
 * Deny by default. Only Super Admin (role 0) is implicit; every other role,
 * including company admins, needs the grant written against it.
 */
class AadhaarExportAccess
{
    public const PRINT_APPOINTMENT = 'appointments.print_full_aadhaar';

    public const PDF_APPOINTMENT = 'appointments.export_full_aadhaar_pdf';

    public const PRINT_EMPLOYEE = 'employees.print_full_aadhaar';

    public const PDF_EMPLOYEE = 'employees.export_full_aadhaar_pdf';

    public const TYPE_PRINT = 'PRINT';

    public const TYPE_PDF = 'PDF';

    public const SURFACE_APPOINTMENT = 'APPOINTMENT';

    public const SURFACE_EMPLOYEE = 'EMPLOYEE';

    /** Grant values that count as held. */
    private const ALLOWED_VALUES = ['view_only', 'read_write'];

    /** Every permission this class registers, for seeding and for the RBAC UI. */
    public const ALL = [
        self::PRINT_APPOINTMENT,
        self::PDF_APPOINTMENT,
        self::PRINT_EMPLOYEE,
        self::PDF_EMPLOYEE,
    ];

    /** @return list<string> the two valid export types */
    public static function types(): array
    {
        return [self::TYPE_PRINT, self::TYPE_PDF];
    }

    /**
     * The permission key an export of $exportType on $surface requires.
     *
     * Returns null for an unrecognised combination, which callers must treat as
     * a refusal rather than as "no permission needed".
     */
    public static function permissionFor(string $surface, string $exportType): ?string
    {
        return match ([strtoupper($surface), strtoupper($exportType)]) {
            [self::SURFACE_APPOINTMENT, self::TYPE_PRINT] => self::PRINT_APPOINTMENT,
            [self::SURFACE_APPOINTMENT, self::TYPE_PDF] => self::PDF_APPOINTMENT,
            [self::SURFACE_EMPLOYEE, self::TYPE_PRINT] => self::PRINT_EMPLOYEE,
            [self::SURFACE_EMPLOYEE, self::TYPE_PDF] => self::PDF_EMPLOYEE,
            default => null,
        };
    }

    /**
     * Whether $actor holds $permission.
     *
     * Self-ownership grants nothing here. An employee may read their own Aadhaar
     * on their profile, but exporting an audited confidential document about
     * themselves is still an administrative action.
     */
    public static function holds(?User $actor, ?string $permission): bool
    {
        if (! $actor || $permission === null) {
            return false;
        }

        if ((int) $actor->role === 0) {
            return true;
        }

        $role = Role::where('name', 'User_'.$actor->id.'_Permissions')->first();

        if (! $role) {
            return false;
        }

        // Only the exact key. Unlike AadhaarAccess, which treats its two view
        // keys as interchangeable, print and PDF must not stand in for each
        // other — that is the whole point of separating them.
        return PermissionDimension::where('role_id', $role->id)
            ->where('key_name', $permission)
            ->whereIn('value', self::ALLOWED_VALUES)
            ->exists();
    }

    public static function allows(?User $actor, string $surface, string $exportType): bool
    {
        return self::holds($actor, self::permissionFor($surface, $exportType));
    }

    /** Whether confidential export is switched on at all. */
    public static function featureEnabled(): bool
    {
        return (bool) config('aadhaar.confidential_export_enabled', false);
    }

    public static function tokenTtlSeconds(): int
    {
        return max(1, (int) config('aadhaar.export_token_ttl', 60));
    }
}
