<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The Employee role's own self-service pages and capabilities.
 *
 * Extracted so both the migration and RbacSeeder can call it. A migration can
 * only grant to roles that already exist, and this deployment creates its roles
 * in RbacSeeder — which runs afterwards — so a migration alone leaves a fresh
 * install with an employee role holding none of these, and the employee shell
 * renders three of its six pages.
 *
 * Everything here is self-scoped. self.ticket.read and self.ticket.create cover
 * reading and raising your own tickets; the page nodes are shell visibility.
 * No administrative capability appears in this list, and the accompanying test
 * asserts an employee holds none.
 */
class EmployeeSelfServicePermissionSeeder extends Seeder
{
    /** Self-scoped capabilities the employee shell's screens call. */
    public const SELF_SERVICE_CODES = [
        'self.ticket.read',
        'self.ticket.create',
    ];

    /** The employee shell pages, each of which is now route-enforced. */
    public const EMPLOYEE_PAGES = [
        'ui.portals',
        'ui.portals.employee',
        'ui.portals.employee_dashboard',
        'ui.portals.employee_payslips',
        'ui.portals.employee_form16',
        'ui.portals.employee_tickets',
        'ui.portals.employee_tickets.create',
        'ui.portals.employee_profile',
        'ui.portals.employee_appointment',
    ];

    /** Role codes that mean "an ordinary employee" across deployments. */
    public const EMPLOYEE_ROLE_CODES = ['emp', 'employee'];

    public function run(): void
    {
        if (! Schema::hasTable('role_permissions') || ! Schema::hasTable('permissions')) {
            return;
        }

        $permissionIds = DB::table('permissions')->pluck('id', 'code')->all();

        foreach (self::EMPLOYEE_ROLE_CODES as $roleCode) {
            $roleId = DB::table('roles')->where('code', $roleCode)->value('id');

            if (! $roleId) {
                continue;
            }

            foreach ([...self::SELF_SERVICE_CODES, ...self::EMPLOYEE_PAGES] as $code) {
                $this->grant((int) $roleId, $permissionIds[$code] ?? null);
            }
        }
    }

    /**
     * Grant unless a row already exists.
     *
     * An existing row is left untouched, including an explicit DENY: an
     * administrator who deliberately withheld a page in the Permission Matrix
     * must not have that reversed by a seeder.
     */
    private function grant(int $roleId, ?int $permissionId): void
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

        $row = ['role_id' => $roleId, 'permission_id' => $permissionId];

        if (Schema::hasColumn('role_permissions', 'effect')) {
            $row['effect'] = 'ALLOW';
        }

        if (Schema::hasColumn('role_permissions', 'inherit_to_children')) {
            $row['inherit_to_children'] = true;
        }

        DB::table('role_permissions')->insert($row);
    }
}
