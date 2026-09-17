<?php

use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `mediclaim.claim.delete` — the permission the admin Claims tab's "Delete"
 * button is gated on (`Admin\ClaimController::destroy()`). Marked sensitive:
 * unlike every "retire" pattern elsewhere in this module, this is a genuine
 * hard delete, intended for a super admin cleaning up test/duplicate/
 * erroneous claim rows, not routine HR use — nothing grants it to any role
 * here, so in practice only the super-admin bypass in `RequirePermission`
 * can use it until a company explicitly grants it. Cloned from
 * 000016's/000005's shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        $code = 'mediclaim.claim.delete';
        $id = DB::table('permissions')->where('code', $code)->value('id');

        if ($id === null) {
            $groupId = Schema::hasTable('permission_groups')
                ? DB::table('permission_groups')->where('name', 'Mediclaim')->value('id')
                : null;

            DB::table('permissions')->insert([
                'name' => $code,
                'code' => $code,
                'resource' => 'mediclaim.claim',
                'action' => 'delete',
                'level' => 'WRITE',
                'group_id' => $groupId,
                'description' => 'Permanently delete a Mediclaim claim',
                'is_sensitive' => true,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        app(AuthorizationCache::class)->invalidate();
    }

    public function down(): void
    {
        // Additive compatibility grants are intentionally not revoked on rollback.
    }
};
