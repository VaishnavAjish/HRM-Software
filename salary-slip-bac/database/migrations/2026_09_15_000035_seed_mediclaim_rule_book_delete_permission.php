<?php

use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Adds `mediclaim.rule_book.delete`, needed now that rule-book *languages*
 * (and their rule books) are a full CRUD resource — the original
 * `2026_09_15_000028_seed_mediclaim_permissions.php` seed only covered
 * read/create/update/publish. Also grants it to every active role, mirroring
 * `2026_09_15_000031_grant_mediclaim_permissions_to_all_roles_for_local_testing.php`'s
 * local-testing convenience grant for every other mediclaim.* code — that
 * migration only swept codes that existed when it ran, so a code added
 * afterward needs the same grant step repeated here.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        $code = 'mediclaim.rule_book.delete';
        $groupId = Schema::hasTable('permission_groups')
            ? DB::table('permission_groups')->where('name', 'Mediclaim')->value('id')
            : null;

        $id = DB::table('permissions')->where('code', $code)->value('id');
        if ($id === null) {
            $id = DB::table('permissions')->insertGetId([
                'name' => $code,
                'code' => $code,
                'resource' => str($code)->beforeLast('.')->toString(),
                'action' => 'delete',
                'level' => 'WRITE',
                'group_id' => $groupId,
                'description' => ucwords(str_replace(['.', '_'], ' ', $code)),
                'is_sensitive' => false,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if (Schema::hasTable('roles') && Schema::hasTable('role_permissions')) {
            $roleIds = DB::table('roles')->where('is_active', true)->pluck('id');

            foreach ($roleIds as $roleId) {
                $exists = DB::table('role_permissions')
                    ->where('role_id', $roleId)
                    ->where('permission_id', $id)
                    ->exists();

                if ($exists) {
                    continue;
                }

                $row = ['role_id' => $roleId, 'permission_id' => $id];

                if (Schema::hasColumn('role_permissions', 'effect')) {
                    $row['effect'] = 'ALLOW';
                }

                if (Schema::hasColumn('role_permissions', 'inherit_to_children')) {
                    $row['inherit_to_children'] = true;
                }

                DB::table('role_permissions')->insert($row);
            }
        }

        if (class_exists(AuthorizationCache::class)) {
            app(AuthorizationCache::class)->invalidate();
        }
    }

    public function down(): void
    {
        // Additive; not reversed (matches sibling permission-seed migrations).
    }
};
