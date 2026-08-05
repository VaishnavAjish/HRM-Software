<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Permission codes for the ticket module.
 *
 * The `self.` prefix is not cosmetic: AuthorizationEngine::legacyDecision allows
 * an employee exactly `self.*`, `payroll.payslip.read` and `hr.profile.*`, so a
 * ticket permission named anything else would deny every employee whenever the
 * engine falls back to the legacy path — which is precisely the state a fresh
 * deployment is in before these rows exist.
 *
 * Staff codes use `support.ticket.*`, which the same function allows for admins.
 * Both are seeded explicitly anyway so the primary path grants them rather than
 * relying on the shadow-mode rescue.
 */
return new class extends Migration
{
    private const PERMISSIONS = [
        // code, resource, action, level, description, staff_only
        ['self.ticket.read',      'self.ticket',    'read',   'READ',  'View own support tickets',       false],
        ['self.ticket.create',    'self.ticket',    'create', 'WRITE', 'Raise and reply to own tickets', false],
        ['support.ticket.read',   'support.ticket', 'read',   'READ',  'View support tickets in scope',  true],
        ['support.ticket.update', 'support.ticket', 'update', 'WRITE', 'Change ticket status',           true],
        ['support.ticket.assign', 'support.ticket', 'assign', 'WRITE', 'Assign tickets to staff',        true],
    ];

    /**
     * Roles that already hold this get the staff ticket codes. Using an existing
     * admin-ish grant as the template avoids inventing a role list that would
     * drift from however this deployment actually assigns permissions.
     */
    private const STAFF_TEMPLATE = 'hr.employee.read';

    private const EMPLOYEE_TEMPLATE = 'self.payslip.read';

    public function up(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        $groupId = Schema::hasTable('permission_groups')
            ? DB::table('permission_groups')->where('name', 'Support')->value('id')
            : null;

        foreach (self::PERMISSIONS as [$code, $resource, $action, $level, $description, $staffOnly]) {
            $id = DB::table('permissions')->where('code', $code)->value('id');

            if ($id === null) {
                DB::table('permissions')->insert([
                    'name' => $code,
                    'code' => $code,
                    'resource' => $resource,
                    'action' => $action,
                    'level' => $level,
                    'group_id' => $groupId,
                    'description' => $description,
                    'is_sensitive' => false,
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
                $id = DB::table('permissions')->where('code', $code)->value('id');
            }

            if ($id === null) {
                continue;
            }

            $template = $staffOnly ? self::STAFF_TEMPLATE : self::EMPLOYEE_TEMPLATE;
            $templateId = DB::table('permissions')->where('code', $template)->value('id');

            if ($templateId === null) {
                continue;
            }

            $holders = DB::table('role_permissions')
                ->where('permission_id', $templateId)
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
    }

    public function down(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        foreach (self::PERMISSIONS as [$code]) {
            $id = DB::table('permissions')->where('code', $code)->value('id');

            if ($id === null) {
                continue;
            }

            if (Schema::hasTable('role_permissions')) {
                DB::table('role_permissions')->where('permission_id', $id)->delete();
            }

            if (Schema::hasTable('user_permissions')) {
                DB::table('user_permissions')->where('permission_id', $id)->delete();
            }

            DB::table('permissions')->where('id', $id)->delete();
        }
    }
};
