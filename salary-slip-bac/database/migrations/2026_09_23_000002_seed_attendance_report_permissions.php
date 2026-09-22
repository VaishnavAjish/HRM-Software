<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — Phase 5. Permission codes for the reports/
 * dashboard routes added after the original engine permission seed
 * (2026_09_22_000010) had already been written — kept as its own migration
 * rather than editing that one, since a migration already handed to the
 * user is never mutated after the fact (same discipline as attendance_rules
 * itself never being edited in place). Same idempotent insert + "mirror
 * whichever roles already hold the legacy attendance permission" grant
 * logic as that migration; see its docblock for the full reasoning.
 */
return new class extends Migration
{
    private const CODES = [
        ['code' => 'attendance.report.read', 'action' => 'read', 'level' => 'READ', 'sensitive' => false],
        ['code' => 'attendance.report.export', 'action' => 'export', 'level' => 'WRITE', 'sensitive' => true],
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
            ->whereIn('code', ['hr.attendance.read', 'hr.attendance.update', 'hr.shift.read'])
            ->pluck('id', 'code');

        if ($legacyCodeIds->isEmpty()) {
            return;
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
