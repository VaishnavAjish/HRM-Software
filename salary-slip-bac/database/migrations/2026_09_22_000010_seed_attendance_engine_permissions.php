<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — permission codes for the new v1/attendance/*
 * routes (routes/attendance_engine.php). Mirrors Mediclaim's own permission
 * seed migration (2026_09_15_000028): insert the codes (idempotent,
 * insertOrIgnore), then grant each new code to every role that ALREADY
 * holds the related legacy code (`hr.attendance.read`/`.update`,
 * `hr.shift.read`) — never a blanket "grant to every role" sweep (that
 * pattern is flagged as a real risk in this codebase's own Mediclaim
 * module — see MEDICLAIM_BACKEND_REPORT.md Part 9 #21/#22 — so it is
 * deliberately NOT repeated here). An admin who can already see attendance
 * gets the new engine screens too, with no separate manual re-grant step;
 * nobody else is silently widened.
 *
 * Skips entirely if the base RBAC tables aren't present yet — same guard
 * Mediclaim's own permission-seed migration uses.
 */
return new class extends Migration
{
    private const CODES = [
        ['code' => 'attendance.daily.read', 'action' => 'read', 'level' => 'READ', 'sensitive' => false],
        ['code' => 'attendance.punch.read', 'action' => 'read', 'level' => 'READ', 'sensitive' => true],
        ['code' => 'attendance.rule.read', 'action' => 'read', 'level' => 'READ', 'sensitive' => false],
        ['code' => 'attendance.rule.create', 'action' => 'create', 'level' => 'WRITE', 'sensitive' => true],
        ['code' => 'attendance.rule.update', 'action' => 'update', 'level' => 'WRITE', 'sensitive' => true],
        ['code' => 'attendance.regularization.read', 'action' => 'read', 'level' => 'READ', 'sensitive' => false],
        ['code' => 'attendance.regularization.create', 'action' => 'create', 'level' => 'WRITE', 'sensitive' => false],
        ['code' => 'attendance.regularization.decide', 'action' => 'decide', 'level' => 'WRITE', 'sensitive' => true],
        ['code' => 'attendance.recalculate', 'action' => 'recalculate', 'level' => 'WRITE', 'sensitive' => true],
        ['code' => 'attendance.device.read', 'action' => 'read', 'level' => 'READ', 'sensitive' => false],
        ['code' => 'attendance.device.update', 'action' => 'update', 'level' => 'WRITE', 'sensitive' => false],
        ['code' => 'attendance.sync_history.read', 'action' => 'read', 'level' => 'READ', 'sensitive' => false],
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
