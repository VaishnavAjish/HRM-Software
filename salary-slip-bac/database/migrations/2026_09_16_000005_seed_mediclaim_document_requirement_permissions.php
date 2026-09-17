<?php

use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Permission codes for the new HR-managed document-requirements screen.
 * `.read` is deliberately the SAME code both the admin settings screen and
 * every employee's document checklist check — matching the existing
 * `mediclaim.hospital.read`/`mediclaim.rule_book.read` precedent, where a
 * single non-`self.`-prefixed code already serves both audiences (see
 * `HospitalDirectory`/`RuleBookViewer`, which employees already read
 * through those same "admin" codes). Cloned from 000028/000002's shape.
 */
return new class extends Migration
{
    private const CODES = [
        'mediclaim.document_requirement.read' => ['read', 'READ', false],
        'mediclaim.document_requirement.create' => ['create', 'WRITE', false],
        'mediclaim.document_requirement.update' => ['update', 'WRITE', false],
        'mediclaim.document_requirement.delete' => ['delete', 'WRITE', false],
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
