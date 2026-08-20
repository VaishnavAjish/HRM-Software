<?php

use App\Services\Authorization\AuthorizationCache;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const TRAINING_CODES = [
        'hr.training.read' => ['read', 'READ', false],
        'hr.training.create' => ['create', 'WRITE', false],
        'hr.training.update' => ['update', 'WRITE', false],
        'hr.training.delete' => ['delete', 'WRITE', true],
    ];

    private const TRAINING_ROLES = ['super_administrator', 'tenant_administrator', 'hr_manager'];

    private const DEPARTMENT_PICKER_NODES = [
        'ui.portals.employee_profile',
        'ui.portals.agent_trial_forms',
        'ui.portals.agent_appointments',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        $groupId = Schema::hasTable('permission_groups')
            ? DB::table('permission_groups')->where('name', 'HR Talent & Assets')->value('id')
            : null;

        foreach (self::TRAINING_CODES as $code => [$action, $level, $sensitive]) {
            if (! DB::table('permissions')->where('code', $code)->exists()) {
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

            $permissionId = DB::table('permissions')->where('code', $code)->value('id');
            $roleIds = DB::table('roles')->whereIn('code', self::TRAINING_ROLES)->pluck('id');

            foreach ($roleIds as $roleId) {
                $this->grant($roleId, $permissionId, ! $sensitive);
            }
        }

        $departmentReadId = DB::table('permissions')->where('code', 'hr.department.read')->value('id');

        if ($departmentReadId !== null) {
            $nodeIds = DB::table('permissions')->whereIn('code', self::DEPARTMENT_PICKER_NODES)->pluck('id');

            $roleIds = DB::table('role_permissions')
                ->whereIn('permission_id', $nodeIds)
                ->where('effect', 'ALLOW')
                ->distinct()
                ->pluck('role_id');

            foreach ($roleIds as $roleId) {
                $this->grant($roleId, $departmentReadId, true);
            }
        }

        app(AuthorizationCache::class)->invalidate();
    }

    public function down(): void
    {
    }

    private function grant(int $roleId, ?int $permissionId, bool $inherit): void
    {
        if ($permissionId === null) {
            return;
        }

        $exists = DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->where('permission_id', $permissionId)
            ->exists();

        if ($exists) {
            return;
        }

        DB::table('role_permissions')->insert([
            'role_id' => $roleId,
            'permission_id' => $permissionId,
            'effect' => 'ALLOW',
            'inherit_to_children' => $inherit,
        ]);
    }
};
