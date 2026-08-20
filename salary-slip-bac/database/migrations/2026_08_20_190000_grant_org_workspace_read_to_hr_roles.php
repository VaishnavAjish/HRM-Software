<?php

use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const ROLES = ['hr_manager', 'director', 'recruitment_manager', 'account'];

    private const CODES = [
        'ui.hr.organization.overview',
        'org.unit.read',
        'ui.hr.organization.designations',
        'org.unit_position.read',
        'ui.hr.organization.org_chart',
        'org.chart.read',
        'ui.hr.organization.assignments',
        'org.unit_assignment.read',
        'ui.hr.organization.promotions_transfers',
        'org.change.read',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        $roleIds = DB::table('roles')->whereIn('code', self::ROLES)->pluck('id');
        $permissionIds = DB::table('permissions')->whereIn('code', self::CODES)->pluck('id', 'code');

        foreach ($roleIds as $roleId) {
            foreach (self::CODES as $code) {
                if (! isset($permissionIds[$code])) {
                    continue;
                }

                $exists = DB::table('role_permissions')
                    ->where('role_id', $roleId)
                    ->where('permission_id', $permissionIds[$code])
                    ->exists();

                if ($exists) {
                    continue;
                }

                DB::table('role_permissions')->insert([
                    'role_id' => $roleId,
                    'permission_id' => $permissionIds[$code],
                    'effect' => 'ALLOW',
                    'inherit_to_children' => true,
                ]);
            }
        }

        app(AuthorizationCache::class)->invalidate();
    }

    public function down(): void
    {
    }
};
