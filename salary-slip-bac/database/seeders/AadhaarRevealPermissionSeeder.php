<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\PermissionDimension;
use App\Models\PermissionGroup;
use App\Models\Role;
use App\Models\User;
use App\Support\AadhaarAccess;
use Illuminate\Database\Seeder;

/**
 * Registers the permission that gates revealing a complete Aadhaar number.
 *
 * This app carries two permission surfaces:
 *
 *  - `permissions` / `role_permissions` — the registry an administrator browses.
 *    Seeding here is what makes the permission discoverable by name instead of
 *    requiring someone to already know the internal key.
 *  - `permission_dimensions` — what is actually enforced. PermissionMatrix
 *    writes these rows, /my-permissions reads them, and AadhaarAccess checks
 *    them. The dimension is 'page' because that is the only dimension
 *    /my-permissions returns, so anything else would never reach the browser.
 *
 * Both are written so the two cannot drift apart.
 *
 * Idempotent: safe to run on every deploy. Existing grants are never
 * downgraded — re-running will not take the permission away from anyone who has
 * been given it.
 */
class AadhaarRevealPermissionSeeder extends Seeder
{
    public function run(): void
    {
        $group = PermissionGroup::firstOrCreate(['name' => 'Appointments']);

        Permission::updateOrCreate(
            ['name' => AadhaarAccess::PERMISSION],
            [
                'group_id' => $group->id,
                'description' => 'HIGH RISK — Sensitive personal data. Allows temporarily '
                    .'revealing the complete Aadhaar number on an appointment. Every '
                    .'successful and denied attempt is audited.',
            ]
        );

        $this->grantToSuperAdmins();
    }

    /**
     * Super Admins get it by default; nobody else does.
     *
     * Permissions in this system hang off a per-user role, so each Super Admin
     * needs their own row. AadhaarAccess also allows role 0 implicitly — these
     * rows exist so the grant is visible in the RBAC screens rather than being
     * invisible behaviour buried in code.
     */
    private function grantToSuperAdmins(): void
    {
        $superAdmins = User::where('role', 0)->where('is_deleted', 0)->get(['id', 'name']);

        foreach ($superAdmins as $admin) {
            $role = Role::firstOrCreate(
                ['name' => 'User_'.$admin->id.'_Permissions'],
                ['type' => 'Custom']
            );

            $existing = PermissionDimension::where('dimension', 'page')
                ->where('role_id', $role->id)
                ->where('key_name', AadhaarAccess::PERMISSION)
                ->first();

            // Never overwrite a deliberate revocation. If an administrator has
            // set this to no_access, re-running the seeder must leave it alone.
            if ($existing) {
                continue;
            }

            PermissionDimension::create([
                'dimension' => 'page',
                'role_id' => $role->id,
                'key_name' => AadhaarAccess::PERMISSION,
                'value' => 'view_only',
            ]);
        }
    }
}
