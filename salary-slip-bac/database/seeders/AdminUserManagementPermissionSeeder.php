<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\PermissionGroup;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class AdminUserManagementPermissionSeeder extends Seeder
{
    public const GROUP = 'Authorization Administration';

    public const CODES = [
        'admin.user.read',
        'admin.user.create',
        'admin.user.update',
        'admin.user.delete',
        'admin.user.lock',
        'admin.user.unlock',
        'admin.user.assign_role',
        'admin.user.assign_permission',
        'admin.user.reset_password',
    ];

    private const SENSITIVE = [
        'admin.user.delete',
        'admin.user.lock',
        'admin.user.unlock',
        'admin.user.assign_role',
        'admin.user.assign_permission',
        'admin.user.reset_password',
    ];

    private const GRANTS = [
        'super_administrator' => self::CODES,
        'security_administrator' => self::CODES,
        'tenant_administrator' => [
            'admin.user.read',
            'admin.user.create',
            'admin.user.update',
            'admin.user.lock',
            'admin.user.unlock',
            'admin.user.assign_role',
            'admin.user.reset_password',
        ],
    ];

    private const ACTION_META = [
        'read' => ['View', 'READ', true],
        'create' => ['Create', 'WRITE', true],
        'update' => ['Update', 'WRITE', true],
        'delete' => ['Delete', 'DESTRUCTIVE', true],
        'lock' => ['Lock', 'GOVERNANCE', false],
        'unlock' => ['Unlock', 'GOVERNANCE', false],
        'assign_role' => ['Assign Role', 'GOVERNANCE', false],
        'assign_permission' => ['Assign Permission', 'GOVERNANCE', false],
        'reset_password' => ['Reset Password', 'SENSITIVE', false],
    ];

    public function run(): void
    {
        if (!Schema::hasTable('permissions') || !Schema::hasColumn('permissions', 'code')) {
            return;
        }

        $group = PermissionGroup::firstOrCreate(['name' => self::GROUP]);
        $permissions = [];

        foreach (self::CODES as $code) {
            $parts = explode('.', $code);
            $action = array_pop($parts);

            $permission = Permission::query()->where('code', $code)->orWhere('name', $code)->first()
                ?: new Permission();

            $permission->fill([
                'name' => $code,
                'code' => $code,
                'resource' => implode('.', $parts),
                'action' => $action,
                'level' => 'ADMINISTRATION',
                'group_id' => $group->id,
                'description' => ucwords(str_replace(['.', '_'], ' ', $code)),
                'is_sensitive' => in_array($code, self::SENSITIVE, true),
                'is_active' => true,
            ])->save();

            $permissions[$code] = $permission;
        }

        $this->grant($permissions);
        $this->catalogue($permissions);
    }

    private function grant(array $permissions): void
    {
        if (!Schema::hasTable('roles') || !Schema::hasColumn('roles', 'code')) {
            return;
        }

        $hasEffect = Schema::hasColumn('role_permissions', 'effect');

        foreach (self::GRANTS as $roleCode => $codes) {
            $role = Role::query()->where('code', $roleCode)->first();

            if (!$role) {
                continue;
            }

            foreach ($codes as $code) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $role->id, 'permission_id' => $permissions[$code]->id],
                    $hasEffect
                        ? ['effect' => 'ALLOW', 'inherit_to_children' => !$permissions[$code]->is_sensitive]
                        : []
                );
            }
        }
    }

    private function catalogue(array $permissions): void
    {
        if (!Schema::hasTable('authorization_resource_actions')) {
            return;
        }

        DB::table('authorization_modules')->updateOrInsert(
            ['tenant_id' => null, 'code' => 'admin'],
            ['name' => 'Access Control', 'display_order' => 90, 'is_active' => true, 'updated_at' => now(), 'created_at' => now()]
        );

        $moduleId = DB::table('authorization_modules')->whereNull('tenant_id')->where('code', 'admin')->value('id');

        DB::table('authorization_resources')->updateOrInsert(
            ['code' => 'admin.user'],
            [
                'module_id' => $moduleId,
                'name' => 'Users',
                'description' => 'User accounts, their roles and their direct permissions',
                'resource_type' => 'ENTITY',
                'model_class' => \App\Models\User::class,
                'is_sensitive' => true,
                'supports_row_security' => true,
                'supports_field_security' => true,
                'display_order' => 95,
                'is_active' => true,
                'updated_at' => now(),
                'created_at' => now(),
            ]
        );

        $resourceId = DB::table('authorization_resources')->where('code', 'admin.user')->value('id');
        $order = 0;

        foreach ($permissions as $permission) {
            [$name, $category, $primary] = self::ACTION_META[$permission->action]
                ?? [Str::headline($permission->action), 'WRITE', false];

            DB::table('authorization_actions')->updateOrInsert(
                ['code' => $permission->action],
                [
                    'name' => $name,
                    'category' => $category,
                    'is_sensitive' => in_array($category, ['SENSITIVE', 'DESTRUCTIVE'], true),
                    'is_primary_column' => $primary,
                    'display_order' => $primary ? $order : 1000 + $order,
                    'is_active' => true,
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );

            $order += 10;

            DB::table('authorization_resource_actions')->updateOrInsert(
                [
                    'resource_id' => $resourceId,
                    'action_id' => DB::table('authorization_actions')->where('code', $permission->action)->value('id'),
                ],
                [
                    'permission_id' => $permission->id,
                    'requires_approval' => false,
                    'is_sensitive' => (bool) $permission->is_sensitive,
                    'updated_at' => now(),
                    'created_at' => now(),
                ]
            );
        }
    }
}
