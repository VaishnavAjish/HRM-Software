<?php

use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the two admin-side "Notify Office" permission codes that
 * 2026_09_15_000028's seed list missed: office intimations had a
 * self-service read/create pair (`self.mediclaim.intimation.*`) but nothing
 * for staff to list every employee's intimations or close one out — the
 * `Mediclaim\Admin\IntimationController` this phase adds needed codes that
 * didn't exist yet. Cloned from 000028's own insert loop (same guard, same
 * shape), not a re-run of that migration.
 */
return new class extends Migration
{
    private const CODES = [
        'mediclaim.intimation.read' => ['read', 'READ', true],
        'mediclaim.intimation.close' => ['close', 'WRITE', true],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        $groupId = Schema::hasTable('permission_groups')
            ? DB::table('permission_groups')->where('name', 'Mediclaim')->value('id')
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

        app(AuthorizationCache::class)->invalidate();
    }

    public function down(): void
    {
        // Additive compatibility grants are intentionally not revoked on rollback.
    }
};
