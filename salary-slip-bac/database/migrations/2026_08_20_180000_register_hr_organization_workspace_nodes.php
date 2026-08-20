<?php

use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\Matrix\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const MIRROR = [
        'ui.hr.organization' => 'hr.dashboard.read',
        'ui.hr.organization.overview' => 'org.unit.read',
        'ui.hr.organization.companies' => 'admin.company.read',
        'ui.hr.organization.designations' => 'org.unit_position.read',
        'ui.hr.organization.org_chart' => 'org.chart.read',
        'ui.hr.organization.assignments' => 'org.unit_assignment.read',
        'ui.hr.organization.promotions_transfers' => 'org.change.read',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        app(PermissionCatalogSync::class)->sync();

        foreach (self::MIRROR as $node => $sourceCode) {
            $nodeId = DB::table('permissions')->where('code', $node)->value('id');
            $sourceId = DB::table('permissions')->where('code', $sourceCode)->value('id');

            if ($nodeId === null || $sourceId === null) {
                continue;
            }

            $roleIds = DB::table('role_permissions')
                ->where('permission_id', $sourceId)
                ->where('effect', 'ALLOW')
                ->pluck('role_id');

            foreach ($roleIds as $roleId) {
                $exists = DB::table('role_permissions')
                    ->where('role_id', $roleId)
                    ->where('permission_id', $nodeId)
                    ->exists();

                if ($exists) {
                    continue;
                }

                DB::table('role_permissions')->insert([
                    'role_id' => $roleId,
                    'permission_id' => $nodeId,
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
