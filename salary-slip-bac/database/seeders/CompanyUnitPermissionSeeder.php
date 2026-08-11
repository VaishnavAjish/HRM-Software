<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\PermissionGroup;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Permissions for Access Control → Company & Unit.
 *
 * The grants are deliberately narrow. Company code is the tenant key: it lives
 * in users.company_code, and ScopeMatcher, AuthorizedUserQuery and the
 * authorization cache all partition on it. An actor who can rename or deactivate
 * a company can move or strand every account inside it, which is a larger
 * capability than anything else on the Access Control console.
 *
 * So writes go to the super administrator and the security administrator only.
 * The tenant administrator gets read, because the New User and Edit User forms
 * need the company and unit lists to populate their pickers at all — denying
 * read there would break user creation for the people who do it. Widening the
 * writes is a Permission Matrix decision, made deliberately, not a default.
 */
class CompanyUnitPermissionSeeder extends Seeder
{
    public const GROUP = 'Authorization Administration';

    public const CODES = [
        'admin.company.read',
        'admin.company.create',
        'admin.company.update',
        'admin.company.status',
        'admin.company.delete',
        'admin.unit.read',
        'admin.unit.create',
        'admin.unit.update',
        'admin.unit.status',
        'admin.unit.delete',
    ];

    /** Everything except the two reads reaches tenant scope. */
    private const SENSITIVE = [
        'admin.company.create',
        'admin.company.update',
        'admin.company.status',
        'admin.company.delete',
        'admin.unit.update',
        'admin.unit.status',
        'admin.unit.delete',
    ];

    private const READS = ['admin.company.read', 'admin.unit.read'];

    private const GRANTS = [
        'super_administrator' => self::CODES,
        'security_administrator' => self::CODES,
        // Read only. The pickers need the lists; the tenant key is not theirs
        // to edit.
        'tenant_administrator' => self::READS,
    ];

    public function run(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasColumn('permissions', 'code')) {
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
    }

    private function grant(array $permissions): void
    {
        if (! Schema::hasTable('roles') || ! Schema::hasColumn('roles', 'code')) {
            return;
        }

        $hasEffect = Schema::hasColumn('role_permissions', 'effect');

        foreach (self::GRANTS as $roleCode => $codes) {
            $role = Role::query()->where('code', $roleCode)->first();

            if (! $role) {
                continue;
            }

            foreach ($codes as $code) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $role->id, 'permission_id' => $permissions[$code]->id],
                    $hasEffect
                        ? ['effect' => 'ALLOW', 'inherit_to_children' => ! $permissions[$code]->is_sensitive]
                        : []
                );
            }
        }
    }
}
