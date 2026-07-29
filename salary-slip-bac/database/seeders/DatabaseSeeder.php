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
        User::firstOrCreate(
            ['email' => 'admin@superadmin.com'],
            [
                'emp_code'     => 1000000001,
                'name'         => 'Super Admin',
                'password'     => 'Nidhi@2026',
                'role'         => 0,
                'company_code' => 'nidhi-impex',
                'status'       => 0,
            ]
        );

        User::firstOrCreate(
            ['email' => 'devlopertest@gmail.com'],
            [
                'emp_code'     => 1010101010,
                'name'         => 'Admin',
                'password'     => '123456789',
                'role'         => 0,
                'company_code' => 'nidhi-impex',
                'status'       => 0,
            ]
        );

        // ── NISS Super Admin ───────────────────────────────────
        $nissSuperAdmin = User::firstOrCreate(
            ['email' => 'admin@niss.pro'],
            [
                'emp_code'     => 1000000002,
                'name'         => 'NISS Super Admin',
                'password'     => 'Admin@niss123',
                'role'         => 0,
                'company_code' => 'nidhi-impex',
                'status'       => 0,
            ]
        );

        // Assign the RBAC "Super Admin" role (created by RbacSeeder)
        $this->call(RbacSeeder::class);
        $superAdminRole = Role::where('name', 'Super Admin')->first();
        if ($superAdminRole && !$nissSuperAdmin->roles()->where('role_id', $superAdminRole->id)->exists()) {
            $nissSuperAdmin->roles()->attach($superAdminRole->id);
        }
    }
}
