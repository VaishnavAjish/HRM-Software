<?php

namespace Database\Seeders;

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
    }
}
