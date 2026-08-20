<?php

use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const BUSINESS_SHELL_ROLES = [
        'hr_manager',
        'account',
        'recruitment_manager',
        'security_administrator',
    ];

    private const CODES = ['ui.portals', 'ui.portals.business'];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        $permissionIds = DB::table('permissions')->whereIn('code', self::CODES)->pluck('id', 'code');

        $businessId = $permissionIds['ui.portals.business'] ?? null;
        $agentRoleId = DB::table('roles')->where('code', 'agent')->value('id');

        if ($businessId !== null && $agentRoleId !== null) {
            DB::table('role_permissions')
                ->where('role_id', $agentRoleId)
                ->where('permission_id', $businessId)
                ->delete();
        }

        $roleIds = DB::table('roles')->whereIn('code', self::BUSINESS_SHELL_ROLES)->pluck('id');

        foreach ($roleIds as $roleId) {
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
        }

        app(AuthorizationCache::class)->invalidate();
    }

    public function down(): void
    {
    }
};
