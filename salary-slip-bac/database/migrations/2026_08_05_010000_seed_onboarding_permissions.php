<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Seed onboarding permissions
        try {
            $group = \App\Models\PermissionGroup::where('name', 'HR Talent & Assets')->first();
            if ($group) {
                $permissions = [
                    'hr.onboarding.read' => 'Hr Onboarding Read',
                    'hr.onboarding.journey.read' => 'Hr Onboarding Journey Read',
                    'hr.onboarding.document.read' => 'Hr Onboarding Document Read',
                ];

                foreach ($permissions as $code => $desc) {
                    $parts = explode('.', $code);
                    $action = array_pop($parts);
                    
                    $perm = \App\Models\Permission::firstOrCreate(['code' => $code], [
                        'name' => $code,
                        'code' => $code,
                        'resource' => implode('.', $parts),
                        'action' => $action,
                        'level' => 'ACTION',
                        'group_id' => $group->id,
                        'description' => $desc,
                        'is_sensitive' => false,
                        'is_active' => true,
                    ]);

                    // Assign to admin roles
                    $roles = \App\Models\Role::whereIn('code', ['super_administrator', 'tenant_administrator', 'hr_manager'])->get();
                    foreach ($roles as $role) {
                        \Illuminate\Support\Facades\DB::table('role_permissions')->updateOrInsert(
                            ['role_id' => $role->id, 'permission_id' => $perm->id],
                            ['effect' => 'ALLOW', 'inherit_to_children' => !$perm->is_sensitive]
                        );
                    }
                }
            }
        } catch (\Throwable $e) {
            // Safe fallback if tables are not fully set up
        }
    }

    public function down(): void
    {
        // No-op
    }
};
