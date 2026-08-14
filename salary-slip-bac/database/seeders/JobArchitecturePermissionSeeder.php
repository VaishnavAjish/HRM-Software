<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\PermissionGroup;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Permissions for the Job Architecture workspace (DOMAIN 03.01).
 *
 * Grants to super_administrator and security_administrator for writes.
 * Tenant administrators get read access for pickers.
 */
class JobArchitecturePermissionSeeder extends Seeder
{
    public const GROUP = 'Job Architecture';

    public const CODES = [
        // Job Functions
        'workforce.job_function.read',
        'workforce.job_function.create',
        'workforce.job_function.update',
        'workforce.job_function.delete',
        // Job Categories
        'workforce.job_category.read',
        'workforce.job_category.create',
        'workforce.job_category.update',
        'workforce.job_category.delete',
        // Job Levels
        'workforce.job_level.read',
        'workforce.job_level.create',
        'workforce.job_level.update',
        'workforce.job_level.delete',
        // Job Grades
        'workforce.job_grade.read',
        'workforce.job_grade.create',
        'workforce.job_grade.update',
        'workforce.job_grade.delete',
        // Job Families
        'workforce.job_family.read',
        'workforce.job_family.create',
        'workforce.job_family.update',
        'workforce.job_family.delete',
        // Designations
        'workforce.designation.read',
        'workforce.designation.create',
        'workforce.designation.update',
        'workforce.designation.delete',
        // Jobs
        'workforce.job.read',
        'workforce.job.create',
        'workforce.job.update',
        'workforce.job.delete',
        // Job Descriptions
        'workforce.job_description.read',
        'workforce.job_description.create',
        'workforce.job_description.update',
        'workforce.job_description.delete',
        // Job Responsibilities
        'workforce.job_responsibility.read',
        'workforce.job_responsibility.create',
        'workforce.job_responsibility.update',
        'workforce.job_responsibility.delete',
        // Job Requirements
        'workforce.job_requirement.read',
        'workforce.job_requirement.create',
        'workforce.job_requirement.update',
        'workforce.job_requirement.delete',
        // Job Evaluations
        'workforce.job_evaluation.read',
        'workforce.job_evaluation.create',
        'workforce.job_evaluation.update',
        'workforce.job_evaluation.approve',
        'workforce.job_evaluation.delete',
        // Job Classifications
        'workforce.job_classification.read',
        'workforce.job_classification.create',
        'workforce.job_classification.update',
        'workforce.job_classification.delete',
    ];

    private const SENSITIVE = [
        'workforce.job_function.create',
        'workforce.job_function.update',
        'workforce.job_function.delete',
        'workforce.job_category.create',
        'workforce.job_category.update',
        'workforce.job_category.delete',
        'workforce.job_level.create',
        'workforce.job_level.update',
        'workforce.job_level.delete',
        'workforce.job_grade.create',
        'workforce.job_grade.update',
        'workforce.job_grade.delete',
        'workforce.job_family.create',
        'workforce.job_family.update',
        'workforce.job_family.delete',
        'workforce.designation.create',
        'workforce.designation.update',
        'workforce.designation.delete',
        'workforce.job.create',
        'workforce.job.update',
        'workforce.job.delete',
        'workforce.job_description.create',
        'workforce.job_description.update',
        'workforce.job_description.delete',
        'workforce.job_responsibility.create',
        'workforce.job_responsibility.update',
        'workforce.job_responsibility.delete',
        'workforce.job_requirement.create',
        'workforce.job_requirement.update',
        'workforce.job_requirement.delete',
        'workforce.job_evaluation.create',
        'workforce.job_evaluation.update',
        'workforce.job_evaluation.approve',
        'workforce.job_evaluation.delete',
        'workforce.job_classification.create',
        'workforce.job_classification.update',
        'workforce.job_classification.delete',
    ];

    private const READS = [
        'workforce.job_function.read',
        'workforce.job_category.read',
        'workforce.job_level.read',
        'workforce.job_grade.read',
        'workforce.job_family.read',
        'workforce.designation.read',
        'workforce.job.read',
        'workforce.job_description.read',
        'workforce.job_responsibility.read',
        'workforce.job_requirement.read',
        'workforce.job_evaluation.read',
        'workforce.job_classification.read',
    ];

    private const GRANTS = [
        'super_administrator' => self::CODES,
        'security_administrator' => self::CODES,
        'tenant_administrator' => self::READS,
    ];

    public function run(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasColumn('permissions', 'code')) {
            return;
        }

        $groupId = Schema::hasTable('permission_groups')
            ? PermissionGroup::firstOrCreate(['name' => self::GROUP])->id
            : null;

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
                'group_id' => $groupId,
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
                $permission = $permissions[$code] ?? null;

                if (! $permission) {
                    continue;
                }

                $exists = DB::table('role_permissions')
                    ->where('role_id', $role->id)
                    ->where('permission_id', $permission->id)
                    ->exists();

                if ($exists) {
                    continue;
                }

                $payload = [
                    'role_id' => $role->id,
                    'permission_id' => $permission->id,
                ];

                if ($hasEffect) {
                    $payload['effect'] = 'allow';
                }

                DB::table('role_permissions')->insert($payload);
            }
        }
    }
}
