<?php

use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Complete removal of the Talent Pool feature (candidate-side, not job/asset
 * pools of any other kind) — the tables it introduced
 * (2026_08_15_010020_create_talent_pools_tables.php) and the permission rows
 * it seeded (2026_08_15_010400_seed_candidate_crm_permissions.php, which
 * this migration does not delete — only the two pool-specific rows it once
 * inserted). Deleting `role_permissions` before `permissions` avoids an FK
 * violation.
 */
return new class extends Migration
{
    private const REMOVED_CODES = ['hr.candidate.pool', 'ui.hr.hiring.candidates.talent_pool'];

    public function up(): void
    {
        if (Schema::hasTable('permissions') && Schema::hasTable('role_permissions')) {
            $permissionIds = DB::table('permissions')->whereIn('code', self::REMOVED_CODES)->pluck('id');

            if ($permissionIds->isNotEmpty()) {
                DB::table('role_permissions')->whereIn('permission_id', $permissionIds)->delete();
                DB::table('permissions')->whereIn('id', $permissionIds)->delete();
            }
        }

        Schema::dropIfExists('candidate_talent_pool');
        Schema::dropIfExists('talent_pools');

        if (class_exists(AuthorizationCache::class)) {
            app(AuthorizationCache::class)->invalidate();
        }
    }

    public function down(): void
    {
        // Deliberately irreversible — the feature is gone from the codebase
        // (model, controller methods, routes, frontend all deleted in the
        // same change), so recreating empty tables here would just be dead
        // schema with nothing left to populate or read it.
    }
};
