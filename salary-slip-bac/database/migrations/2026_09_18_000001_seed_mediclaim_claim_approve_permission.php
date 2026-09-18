<?php

use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `mediclaim.claim.approve` — the single, fixed-role permission the
 * simplified claim workflow's one-step approval is gated on
 * (`ReviewQueueController::decide()`'s `approveDirect` dispatch, and
 * `MediclaimClaim::scopeAwaitingReviewBy()`'s matching visibility branch).
 * Unlike the five legacy `mediclaim.claim.*.decide` codes, holding this
 * permission is not tied to being the employee's manager or a company-wide
 * per-stage reviewer-role row — it is a blanket "may approve any submitted
 * claim" grant, intended for a small fixed HR-admin group. Cloned from
 * 2026_09_17_000001's shape.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        $code = 'mediclaim.claim.approve';
        $id = DB::table('permissions')->where('code', $code)->value('id');

        if ($id === null) {
            $groupId = Schema::hasTable('permission_groups')
                ? DB::table('permission_groups')->where('name', 'Mediclaim')->value('id')
                : null;

            DB::table('permissions')->insert([
                'name' => $code,
                'code' => $code,
                'resource' => 'mediclaim.claim',
                'action' => 'approve',
                'level' => 'WRITE',
                'group_id' => $groupId,
                'description' => 'Single-step approve/reject a Mediclaim claim',
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
