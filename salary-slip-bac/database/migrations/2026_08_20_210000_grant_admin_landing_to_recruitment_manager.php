<?php

use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const CODES = ['ui.dashboard', 'ui.admin.dashboard.view'];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        $roleId = DB::table('roles')->where('code', 'recruitment_manager')->value('id');

        if ($roleId === null) {
            return;
        }

        $permissionIds = DB::table('permissions')->whereIn('code', self::CODES)->pluck('id', 'code');

        foreach (self::CODES as $code) {
            if (! isset($permissionIds[$code])) {
                continue;
            }

            $exists = DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->where('permission_id', $permissionIds[$code])
                ->exists();

            if ($exists) {
                continue;
            }

            DB::table('role_permissions')->insert([
                'role_id' => $roleId,
                'permission_id' => $permissionIds[$code],
                'effect' => 'ALLOW',
                'inherit_to_children' => true,
            ]);
        }

        app(AuthorizationCache::class)->invalidate();
    }

    public function down(): void
    {
    }
};
