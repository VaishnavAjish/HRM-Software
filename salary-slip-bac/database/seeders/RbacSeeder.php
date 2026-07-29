<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RbacSeeder extends Seeder
{
    /**
     * Backs the two access levels the Role Permission Matrix manages page
     * permissions for (Super Admin and Admin — Employee/Agent don't get
     * page-permission records). PermissionMatrix.jsx also creates these
     * lazily by name on first use; this just ensures they exist upfront.
     */
    public function run(): void
    {
        Role::firstOrCreate(['name' => 'Super Admin'], ['type' => 'System', 'is_active' => true]);
        Role::firstOrCreate(['name' => 'Admin'], ['type' => 'System', 'is_active' => true]);
    }
}
