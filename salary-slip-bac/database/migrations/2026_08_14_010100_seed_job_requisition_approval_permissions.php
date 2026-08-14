<?php

use App\Services\Authorization\Matrix\PermissionCatalogSync;
use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const CODES = [
        'hr.requisition.submit' => ['submit', 'WRITE', false],
        'hr.requisition.withdraw' => ['withdraw', 'WRITE', false],
        'hr.requisition.hiring_manager.read' => ['read', 'READ', true],
        'hr.requisition.hiring_manager.decide' => ['decide', 'WRITE', true],
        'hr.requisition.director.read' => ['read', 'READ', true],
        'hr.requisition.director.decide' => ['decide', 'WRITE', true],
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

        $this->copyAllows('hr.requisition.approve', [
            'hr.requisition.hiring_manager.read',
            'hr.requisition.hiring_manager.decide',
            'hr.requisition.director.read',
            'hr.requisition.director.decide',
            'ui.hr.hiring.hiring_manager_review',
            'ui.hr.hiring.hiring_manager_review.decide',
            'ui.hr.hiring.director_review',
            'ui.hr.hiring.director_review.decide',
        ]);
        $this->copyAllows('hr.requisition.create', [
            'hr.requisition.submit',
            'ui.hr.hiring.requisition_submit',
        ]);
        $this->copyAllows('hr.requisition.update', [
            'hr.requisition.withdraw',
            'ui.hr.hiring.requisition_withdraw',
        ]);

        // The migration writes role_permissions directly, so explicitly move
        // the authorization cache namespace before any user refreshes a stale
        // snapshot after deployment.
        app(AuthorizationCache::class)->invalidate();
    }

    public function down(): void
    {
        // Additive compatibility grants are intentionally not revoked on rollback.
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
