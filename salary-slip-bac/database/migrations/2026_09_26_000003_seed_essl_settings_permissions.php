<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Permission codes for the new eSSL biometric connection settings screen
 * (essl_settings table / EsslSettingsController). Mirrors
 * 2026_09_22_000010_seed_attendance_engine_permissions.php: insert the codes
 * (idempotent, insertOrIgnore), then grant each to every role that ALREADY
 * holds `hr.attendance.update` -- this is credential management, not plain
 * attendance viewing, so it deliberately does NOT also piggyback on
 * `hr.attendance.read` roles. Skips entirely if base RBAC tables aren't
 * present yet.
 */
return new class extends Migration
{
    private const CODES = [
        ['code' => 'hr.attendance.biometric_settings.read', 'action' => 'read', 'level' => 'READ', 'sensitive' => true],
        ['code' => 'hr.attendance.biometric_settings.update', 'action' => 'update', 'level' => 'WRITE', 'sensitive' => true],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        $now = now();
        foreach (self::CODES as $row) {
            DB::table('permissions')->insertOrIgnore([
                'code' => $row['code'],
                'name' => $row['code'],
                'resource' => implode('.', array_slice(explode('.', $row['code']), 0, -1)),
                'action' => $row['action'],
                'level' => $row['level'],
                'description' => ucwords(str_replace(['.', '_'], ' ', $row['code'])),
                'is_sensitive' => $row['sensitive'],
                'is_active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $legacyCodeIds = DB::table('permissions')
            ->where('code', 'hr.attendance.update')
            ->pluck('id', 'code');

        if ($legacyCodeIds->isEmpty()) {
            return; // base RBAC seeder hasn't run in this environment yet — nothing to mirror
        }

        $roleIds = DB::table('role_permissions')
            ->whereIn('permission_id', $legacyCodeIds->values())
            ->where('effect', 'ALLOW')
            ->pluck('role_id')
            ->unique();

        if ($roleIds->isEmpty()) {
            return;
        }

        $newPermissionIds = DB::table('permissions')->whereIn('code', array_column(self::CODES, 'code'))->pluck('id');

        $grants = [];
        foreach ($roleIds as $roleId) {
            foreach ($newPermissionIds as $permissionId) {
                $exists = DB::table('role_permissions')
                    ->where('role_id', $roleId)->where('permission_id', $permissionId)->exists();
                if (! $exists) {
                    $grants[] = [
                        'role_id' => $roleId,
                        'permission_id' => $permissionId,
                        'effect' => 'ALLOW',
                        'inherit_to_children' => true,
                    ];
                }
            }
        }

        if ($grants) {
            DB::table('role_permissions')->insert($grants);
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        $ids = DB::table('permissions')->whereIn('code', array_column(self::CODES, 'code'))->pluck('id');
        if ($ids->isNotEmpty() && Schema::hasTable('role_permissions')) {
            DB::table('role_permissions')->whereIn('permission_id', $ids)->delete();
        }
        DB::table('permissions')->whereIn('code', array_column(self::CODES, 'code'))->delete();
    }
};
