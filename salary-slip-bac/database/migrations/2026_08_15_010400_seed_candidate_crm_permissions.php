<?php

use App\Services\Authorization\AuthorizationCache;
use App\Services\Authorization\Matrix\PermissionCatalogSync;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Wave 4 — Candidate CRM fine-grained write codes (tags, notes, talent pools,
 * communication) plus the matching Permission Matrix nodes. Roles that already
 * hold candidate update (business) or the candidates page (UI) inherit the new
 * codes, so nothing regresses at release time while the Matrix gains control.
 */
return new class extends Migration
{
    private const CODES = [
        'hr.candidate.tag' => ['tag', 'WRITE', false],
        'hr.candidate.note' => ['note', 'WRITE', false],
        'hr.candidate.pool' => ['pool', 'WRITE', false],
        'hr.candidate.communication' => ['communication', 'WRITE', true],
    ];

    private const NODES = [
        'ui.hr.hiring.candidates.tags' => ['Tags', 41],
        'ui.hr.hiring.candidates.notes' => ['Notes', 42],
        'ui.hr.hiring.candidates.talent_pool' => ['Talent Pool', 43],
        'ui.hr.hiring.candidates.communication' => ['Communication', 44],
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
            if (DB::table('permissions')->where('code', $code)->exists()) {
                continue;
            }
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

        $this->copyAllows('hr.candidate.update', array_keys(self::CODES));
        $this->copyAllows('ui.hr.hiring.candidates', array_keys(self::NODES));

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