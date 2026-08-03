<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\PermissionGroup;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Adds the permission codes for the new HR Talent & Assets module
 * (requisitions, candidates, interviews, offers, assets, performance,
 * reports, plus read-only placeholders for the not-yet-built shell
 * sections) without touching RbacSeeder.php. Must run after RbacSeeder,
 * since it looks roles up by the codes RbacSeeder creates.
 */
class HrTalentRbacSeeder extends Seeder
{
    private const CATALOGUE = [
        'hr.dashboard.read',

        'hr.requisition.read', 'hr.requisition.create', 'hr.requisition.update',
        'hr.requisition.delete', 'hr.requisition.approve', 'hr.requisition.publish',

        'hr.candidate.read', 'hr.candidate.create', 'hr.candidate.update',
        'hr.candidate.delete', 'hr.candidate.move_stage', 'hr.candidate.export',

        'hr.interview.read', 'hr.interview.create', 'hr.interview.update',
        'hr.interview.delete', 'hr.interview.feedback',

        'hr.offer.read', 'hr.offer.create', 'hr.offer.update',
        'hr.offer.approve', 'hr.offer.release', 'hr.offer.export',

        'hr.asset.read', 'hr.asset.create', 'hr.asset.update', 'hr.asset.delete',
        'hr.asset.allocate', 'hr.asset.return', 'hr.asset.transfer', 'hr.asset.export',

        'hr.performance.read', 'hr.performance.create', 'hr.performance.update',
        'hr.performance.review', 'hr.performance.export',

        'hr.report.read', 'hr.report.export',

        // Placeholder read-only codes for the not-yet-built shell sections.
        'hr.onboarding.read', 'hr.lifecycle.read', 'hr.separation.read',
        'hr.exit.read', 'hr.org_insights.read', 'hr.hr_settings.read',
    ];

    public function run(): void
    {
        $group = PermissionGroup::firstOrCreate(['name' => 'HR Talent & Assets']);

        $permissions = [];
        foreach (self::CATALOGUE as $code) {
            $parts = explode('.', $code);
            $action = array_pop($parts);
            $permission = Permission::query()->where('code', $code)->first() ?: new Permission();
            $permission->fill([
                'name' => $code,
                'code' => $code,
                'resource' => implode('.', $parts),
                'action' => $action,
                'level' => 'ACTION',
                'group_id' => $group->id,
                'description' => ucwords(str_replace(['.', '_'], ' ', $code)),
                'is_sensitive' => in_array($action, ['delete', 'approve', 'release'], true),
                'is_active' => true,
            ])->save();
            $permissions[$code] = $permission;
        }

        $roleCodes = [
            'super_administrator' => array_keys($permissions),
            'tenant_administrator' => array_keys($permissions),
            'hr_manager' => array_keys($permissions),
            'recruitment_manager' => array_values(array_filter(array_keys($permissions), fn ($code) =>
                str_starts_with($code, 'hr.requisition.') || str_starts_with($code, 'hr.candidate.') ||
                str_starts_with($code, 'hr.interview.') || str_starts_with($code, 'hr.offer.') ||
                $code === 'hr.dashboard.read'
            )),
        ];

        foreach ($roleCodes as $roleCode => $codes) {
            $role = Role::query()->where('code', $roleCode)->first();
            if (!$role) {
                continue;
            }
            foreach ($codes as $code) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $role->id, 'permission_id' => $permissions[$code]->id],
                    ['effect' => 'ALLOW', 'inherit_to_children' => !$permissions[$code]->is_sensitive]
                );
            }
        }
    }
}
