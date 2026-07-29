<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // The legacy admin@superadmin.com and devlopertest@gmail.com super-admin
        // accounts were removed: they shipped with shared, hardcoded passwords.
        // admin@niss.pro below is the only seeded super admin. Existing rows are
        // deleted by the 2026_07_29_000001_remove_legacy_super_admin_accounts
        // migration — do not reintroduce them here.

        // ── NISS Super Admin ───────────────────────────────────
        $nissSuperAdmin = User::firstOrCreate(
            ['email' => 'admin@niss.pro'],
            [
                'emp_code'     => 1000000002,
                'name'         => 'NISS Super Admin',
                // Only used when the account does not exist yet; an existing
                // password is never overwritten. Set SEED_SUPER_ADMIN_PASSWORD
                // in .env so a fresh install does not start with a password
                // that is published in this repository's history.
                'password'     => env('SEED_SUPER_ADMIN_PASSWORD', 'Admin@niss123'),
                'role'         => 0,
                'company_code' => 'nidhi-impex',
                'status'       => 0,
            ]
        );

        // firstOrCreate only applies those defaults when the row is new, so an
        // account that predates this seeder (or was later edited down to a
        // lower role, deactivated, or soft-deleted) would keep its old values
        // and stay invisible. Re-assert the super-admin state on every run.
        //
        // `password` is deliberately excluded: it is cast to `hashed`, so
        // re-assigning it here would reset a password changed in production.
        $nissSuperAdmin->fill([
            'role'       => 0, // 0 = Super Admin (see users table migration)
            'status'     => 0,
            'is_deleted' => 0,
        ])->save();

        // Assign the RBAC "Super Admin" role (created by RbacSeeder)
        $this->call(RbacSeeder::class);
        $superAdminRole = Role::where('name', 'Super Admin')->first();
        if ($superAdminRole) {
            // Idempotent, and won't strip any other roles already attached.
            $nissSuperAdmin->roles()->syncWithoutDetaching([$superAdminRole->id]);
        }
    }
}
