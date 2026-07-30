<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\PermissionDimension;
use App\Models\PermissionGroup;
use App\Models\Role;
use App\Models\User;
use App\Support\AadhaarAccess;
use App\Support\AadhaarExportAccess;
use Illuminate\Database\Seeder;

/**
 * Registers every permission that gates a complete Aadhaar number.
 *
 * This app carries two permission surfaces:
 *
 *  - `permissions` / `role_permissions` — the registry an administrator browses.
 *    Seeding here is what makes the permission discoverable by name instead of
 *    requiring someone to already know the internal key.
 *  - `permission_dimensions` — what is actually enforced. PermissionMatrix
 *    writes these rows, /my-permissions reads them, and AadhaarAccess /
 *    AadhaarExportAccess check them. The dimension is 'page' because that is the
 *    only dimension /my-permissions returns, so anything else would never reach
 *    the browser.
 *
 * Both are written so the two cannot drift apart.
 *
 * Idempotent: safe to run on every deploy. Existing grants are never
 * downgraded — re-running will not take the permission away from anyone who has
 * been given it, and will not undo a deliberate revocation.
 */
class AadhaarRevealPermissionSeeder extends Seeder
{
    /**
     * Every Aadhaar permission, its group and what it allows.
     *
     * View, print and PDF are separate rows deliberately. Reading a number on
     * screen ends when the tab closes; a printed sheet and a downloaded file do
     * not, so being trusted with one is not evidence of being trusted with the
     * others.
     *
     * @return list<array{key: string, group: string, description: string}>
     */
    private function definitions(): array
    {
        return [
            [
                'key' => AadhaarAccess::PERMISSION,
                'group' => 'Appointments',
                'description' => 'HIGH RISK — Sensitive personal data. Allows viewing the '
                    .'complete Aadhaar number on an appointment. Every successful and denied '
                    .'attempt is audited.',
            ],
            [
                'key' => AadhaarExportAccess::PRINT_APPOINTMENT,
                'group' => 'Appointments',
                'description' => 'HIGH RISK — Allows printing an appointment document containing '
                    .'the complete Aadhaar number. Printed copies leave application access '
                    .'control permanently. Requires fresh authorization and is audited per print.',
            ],
            [
                'key' => AadhaarExportAccess::PDF_APPOINTMENT,
                'group' => 'Appointments',
                'description' => 'HIGH RISK — Allows downloading a server-generated confidential '
                    .'PDF containing the complete Aadhaar number. Downloaded files cannot be '
                    .'recalled. Requires fresh authorization and is audited per download.',
            ],
            [
                'key' => AadhaarAccess::EMPLOYEE_PERMISSION,
                'group' => 'Employees',
                'description' => 'HIGH RISK — Sensitive personal data. Allows viewing the '
                    .'complete Aadhaar number on an employee record. Viewing your own is always '
                    .'permitted and needs no grant.',
            ],
            [
                'key' => AadhaarExportAccess::PRINT_EMPLOYEE,
                'group' => 'Employees',
                'description' => 'HIGH RISK — Allows printing an employee document containing the '
                    .'complete Aadhaar number. Printed copies leave application access control '
                    .'permanently.',
            ],
            [
                'key' => AadhaarExportAccess::PDF_EMPLOYEE,
                'group' => 'Employees',
                'description' => 'HIGH RISK — Allows downloading a server-generated confidential '
                    .'PDF containing an employee\'s complete Aadhaar number.',
            ],
        ];
    }

    public function run(): void
    {
        $groups = [];

        foreach ($this->definitions() as $definition) {
            $groups[$definition['group']] ??= PermissionGroup::firstOrCreate(['name' => $definition['group']]);

            Permission::updateOrCreate(
                ['name' => $definition['key']],
                [
                    'group_id' => $groups[$definition['group']]->id,
                    'description' => $definition['description'],
                ]
            );
        }

        $this->grantToSuperAdmins();
    }

    /**
     * Super Admins get all of them by default; nobody else gets any.
     *
     * Permissions in this system hang off a per-user role, so each Super Admin
     * needs their own row. The access classes also allow role 0 implicitly —
     * these rows exist so the grant is visible in the RBAC screens rather than
     * being invisible behaviour buried in code.
     */
    private function grantToSuperAdmins(): void
    {
        $superAdmins = User::where('role', 0)->where('is_deleted', 0)->get(['id', 'name']);
        $keys = array_column($this->definitions(), 'key');

        foreach ($superAdmins as $admin) {
            $role = Role::firstOrCreate(
                ['name' => 'User_'.$admin->id.'_Permissions'],
                ['type' => 'Custom']
            );

            foreach ($keys as $key) {
                $existing = PermissionDimension::where('dimension', 'page')
                    ->where('role_id', $role->id)
                    ->where('key_name', $key)
                    ->exists();

                // Never overwrite a deliberate revocation. If an administrator
                // has set this to no_access, re-running must leave it alone.
                if ($existing) {
                    continue;
                }

                PermissionDimension::create([
                    'dimension' => 'page',
                    'role_id' => $role->id,
                    'key_name' => $key,
                    'value' => 'view_only',
                ]);
            }
        }
    }
}
