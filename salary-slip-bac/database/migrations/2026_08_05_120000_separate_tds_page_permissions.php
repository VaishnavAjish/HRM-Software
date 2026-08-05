<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const NEW_CODES = [
        'ui.admin.tds.view' => 'Ui Admin Tds View',
        'ui.admin.form16.view' => 'Ui Admin Form16 View',
    ];

    private const SOURCE_CODE = 'payroll.payslip.read';

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        $groupId = Schema::hasTable('permission_groups')
            ? DB::table('permission_groups')->where('name', 'UI and Analytics')->value('id')
            : null;

        $sourceId = DB::table('permissions')->where('code', self::SOURCE_CODE)->value('id');

        foreach (self::NEW_CODES as $code => $description) {
            $parts = explode('.', $code);
            $action = array_pop($parts);

            $existing = DB::table('permissions')->where('code', $code)->value('id');

            if ($existing === null) {
                DB::table('permissions')->insert([
                    'name' => $code,
                    'code' => $code,
                    'resource' => implode('.', $parts),
                    'action' => $action,
                    'level' => 'READ',
                    'group_id' => $groupId,
                    'description' => $description,
                    'is_sensitive' => false,
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $existing = DB::table('permissions')->where('code', $code)->value('id');
            }

            if ($sourceId === null || $existing === null) {
                continue;
            }

            $holders = DB::table('role_permissions')
                ->where('permission_id', $sourceId)
                ->where('effect', 'ALLOW')
                ->pluck('role_id');

            foreach ($holders as $roleId) {
                $already = DB::table('role_permissions')
                    ->where('role_id', $roleId)
                    ->where('permission_id', $existing)
                    ->exists();

                if (! $already) {
                    DB::table('role_permissions')->insert([
                        'role_id' => $roleId,
                        'permission_id' => $existing,
                        'effect' => 'ALLOW',
                        'obligations' => null,
                        'inherit_to_children' => true,
                    ]);
                }
            }
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        $ids = DB::table('permissions')->whereIn('code', array_keys(self::NEW_CODES))->pluck('id');

        if ($ids->isEmpty()) {
            return;
        }

        if (Schema::hasTable('authorization_resource_actions')) {
            DB::table('authorization_resource_actions')->whereIn('permission_id', $ids)->delete();
        }

        if (Schema::hasTable('authorization_resources')) {
            DB::table('authorization_resources')->whereIn('code', ['ui.admin.tds', 'ui.admin.form16'])->delete();
        }

        DB::table('role_permissions')->whereIn('permission_id', $ids)->delete();
        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
