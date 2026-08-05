<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const CODE = 'payroll.form16.read';

    private const SOURCE_CODE = 'payroll.payslip.read';

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        $groupId = Schema::hasTable('permission_groups')
            ? DB::table('permission_groups')->where('name', 'Payroll')->value('id')
            : null;

        $id = DB::table('permissions')->where('code', self::CODE)->value('id');

        if ($id === null) {
            DB::table('permissions')->insert([
                'name' => self::CODE,
                'code' => self::CODE,
                'resource' => 'payroll.form16',
                'action' => 'read',
                'level' => 'READ',
                'group_id' => $groupId,
                'description' => 'Payroll Form16 Read',
                'is_sensitive' => false,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $id = DB::table('permissions')->where('code', self::CODE)->value('id');
        }

        $sourceId = DB::table('permissions')->where('code', self::SOURCE_CODE)->value('id');

        if ($sourceId === null || $id === null) {
            return;
        }

        $holders = DB::table('role_permissions')
            ->where('permission_id', $sourceId)
            ->where('effect', 'ALLOW')
            ->pluck('role_id');

        foreach ($holders as $roleId) {
            $already = DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->where('permission_id', $id)
                ->exists();

            if (! $already) {
                DB::table('role_permissions')->insert([
                    'role_id' => $roleId,
                    'permission_id' => $id,
                    'effect' => 'ALLOW',
                    'obligations' => null,
                    'inherit_to_children' => true,
                ]);
            }
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        $id = DB::table('permissions')->where('code', self::CODE)->value('id');

        if ($id === null) {
            return;
        }

        if (Schema::hasTable('authorization_resource_actions')) {
            DB::table('authorization_resource_actions')->where('permission_id', $id)->delete();
        }

        if (Schema::hasTable('authorization_resources')) {
            DB::table('authorization_resources')->where('code', 'payroll.form16')->delete();
        }

        DB::table('role_permissions')->where('permission_id', $id)->delete();
        DB::table('permissions')->where('id', $id)->delete();
    }
};
