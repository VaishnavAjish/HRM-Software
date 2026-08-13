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

        // The seeded super-admin password must never be a constant published in
        // this repository — a fresh install or re-seed would otherwise create a
        // root account whose password is known to anyone with the source.
        $seedPassword = env('SEED_SUPER_ADMIN_PASSWORD');
        if (blank($seedPassword)) {
            if (app()->environment('production')) {
                throw new \RuntimeException(
                    'SEED_SUPER_ADMIN_PASSWORD is not set. Refusing to seed admin@niss.pro '
                    .'with a hardcoded default. Set it in .env before seeding production.'
                );
            }
            // Non-production: generate a random password rather than a known
            // literal, so no environment ever ships a guessable super admin.
            // Reset it with a password-reset flow after seeding if you need to log in.
            $seedPassword = \Illuminate\Support\Str::password(24);
        }

        // ── NISS Super Admin ───────────────────────────────────
        // password is only applied when the row is new; an existing password is
        // never overwritten (see the fill() below, which excludes it).
        $nissSuperAdmin = User::firstOrCreate(
            ['email' => 'admin@niss.pro'],
            [
                'emp_code'     => 1000000002,
                'name'         => 'NISS Super Admin',
                'password'     => $seedPassword,
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
        $this->call(HrTalentRbacSeeder::class);
        $superAdminRole = Role::where('name', 'Super Admin')->first();
        if ($superAdminRole) {
            // Idempotent, and won't strip any other roles already attached.
            $nissSuperAdmin->roles()->syncWithoutDetaching([$superAdminRole->id]);
        }
    }
}
