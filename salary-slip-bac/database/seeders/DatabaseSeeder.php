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
        User::create([
            'emp_code'     => 1010101010,
            'name'         => 'Admin',
            'email'        => 'devlopertest@gmail.com',
            'password'     => '123456789',
            'role'         => 0,
            'company_code' => 'nidhi-impex',
            'status'       => 0,
        ]);
    }
}
