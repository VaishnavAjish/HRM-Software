<?php

use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\Matrix\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const CODES = [
        'hr.requisition.hr_manager.read' => ['read', 'READ', true],
        'hr.requisition.hr_manager.decide' => ['decide', 'WRITE', true],
        'hr.requisition.job_portal.read' => ['read', 'READ', false],
        'hr.requisition.job_portal.publish' => ['publish', 'WRITE', true],
        'hr.requisition.department.override' => ['override', 'WRITE', true],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        app(PermissionCatalogSync::class)->sync();

        $groupId = Schema::hasTable('permission_groups')
            ? DB::table('permission_groups')->where('name', 'HR Talent & Assets')->value('id')
            : null;

        foreach (self::CODES as $code => [$action, $level, $sensitive]) {
            $id = DB::table('permissions')->where('code', $code)->value('id');
            if ($id === null) {
                DB::table('permissions')->insert([
                    'name' => $code,
                    'code' => $code,
                    'resource' => str($code)->beforeLast('.')->toString(),
                    'action' => $action,
                    'level' => $level,
                    'group_id' => $groupId,
                    'description' => ucwords(str_replace(['.', '_'], ' ', $code)),
                    'is_sensitive' => $sensitive,
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        $this->copyAllows('hr.requisition.hiring_manager.read', ['hr.requisition.hr_manager.read', 'ui.hr.hiring.hr_manager_review']);
        $this->copyAllows('hr.requisition.hiring_manager.decide', ['hr.requisition.hr_manager.decide', 'ui.hr.hiring.hr_manager_review.decide']);
        $this->copyAllows('hr.requisition.approve', ['hr.requisition.hr_manager.read', 'hr.requisition.hr_manager.decide', 'ui.hr.hiring.hr_manager_review', 'ui.hr.hiring.hr_manager_review.decide']);
        $this->copyAllows('hr.requisition.publish', ['hr.requisition.job_portal.read', 'hr.requisition.job_portal.publish', 'ui.hr.hiring.job_portal', 'ui.hr.hiring.job_portal.publish']);

        app(AuthorizationCache::class)->invalidate();
    }

    public function down(): void
    {
    }

    private function copyAllows(string $sourceCode, array $targetCodes): void
    {
        $sourceId = DB::table('permissions')->where('code', $sourceCode)->value('id');
        if ($sourceId === null) {
            return;
        }

        $roleIds = DB::table('role_permissions')
            ->where('permission_id', $sourceId)
            ->where('effect', 'ALLOW')
            ->pluck('role_id');

        foreach ($targetCodes as $targetCode) {
            $targetId = DB::table('permissions')->where('code', $targetCode)->value('id');
            if ($targetId === null) {
                continue;
            }
            foreach ($roleIds as $roleId) {
                DB::table('role_permissions')->insertOrIgnore([
                    'role_id' => $roleId,
                    'permission_id' => $targetId,
                    'effect' => 'ALLOW',
                    'obligations' => null,
                    'inherit_to_children' => true,
                ]);
            }
        }
    }
};
