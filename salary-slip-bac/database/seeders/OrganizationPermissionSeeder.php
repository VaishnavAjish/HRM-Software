<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\PermissionGroup;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Permissions for the Organization workspace (DOMAIN 02).
 *
 * Mirrors CompanyUnitPermissionSeeder: writes go to the super administrator and
 * security administrator only, because locations and legal entities are tenant
 * master data and editing them reaches every account inside the company. The
 * tenant administrator gets the reads — the pickers on other screens need the
 * lists — and `org.master.update` is sensitive for the same reason a company
 * edit is: it changes the statutory record every payslip names.
 */
class OrganizationPermissionSeeder extends Seeder
{
    public const GROUP = 'Organization Administration';

    public const CODES = [
        'org.master.read',
        'org.master.update',
        'org.legal_entity.read',
        'org.legal_entity.create',
        'org.legal_entity.update',
        'org.legal_entity.status',
        'org.legal_entity.delete',
        'org.location.read',
        'org.location.create',
        'org.location.update',
        'org.location.status',
        'org.location.delete',
        'org.calendar.read',
        'org.calendar.create',
        'org.calendar.update',
        'org.calendar.status',
        'org.calendar.delete',
        // 02.01 enterprises
        'org.enterprise.read',
        'org.enterprise.create',
        'org.enterprise.update',
        'org.enterprise.status',
        'org.enterprise.delete',
        // 02.03 organization units / positions / assignments
        'org.unit.read',
        'org.unit.create',
        'org.unit.update',
        'org.unit.status',
        'org.unit.delete',
        'org.unit_position.read',
        'org.unit_position.create',
        'org.unit_position.update',
        'org.unit_position.delete',
        'org.unit_assignment.read',
        'org.unit_assignment.create',
        'org.unit_assignment.update',
        'org.unit_assignment.delete',
        // 02.04 organization locations / types / work-location mappings
        'org.org_location.read',
        'org.org_location.create',
        'org.org_location.update',
        'org.org_location.status',
        'org.org_location.delete',
        'org.location_type.read',
        'org.location_type.create',
        'org.work_location.read',
        'org.work_location.create',
        'org.work_location.delete',
        // 02.05 financial organization / GL mappings / allocation rules
        'org.financial.read',
        'org.financial.create',
        'org.financial.update',
        'org.financial.status',
        'org.financial.delete',
        'org.financial_gl.read',
        'org.financial_gl.create',
        'org.financial_gl.update',
        'org.financial_gl.delete',
        'org.financial_allocation.read',
        'org.financial_allocation.create',
        'org.financial_allocation.update',
        'org.financial_allocation.delete',
        // 02.06 hierarchies / nodes / edges
        'org.hierarchy.read',
        'org.hierarchy.create',
        'org.hierarchy.update',
        'org.hierarchy.status',
        'org.hierarchy.delete',
        'org.hierarchy_node.read',
        'org.hierarchy_node.create',
        'org.hierarchy_node.update',
        'org.hierarchy_node.delete',
        'org.hierarchy_edge.read',
        'org.hierarchy_edge.create',
        'org.hierarchy_edge.update',
        'org.hierarchy_edge.delete',
        // 02.07 reporting structure / leadership assignments
        'org.reporting.read',
        'org.reporting.create',
        'org.reporting.update',
        'org.reporting.delete',
        'org.reporting_leadership.read',
        'org.reporting_leadership.create',
        'org.reporting_leadership.update',
        'org.reporting_leadership.delete',
        // 02.08 org chart
        'org.chart.read',
        // 02.09 change management
        'org.change.read',
        'org.change.create',
        'org.change.update',
        'org.change.submit',
        'org.change.approve',
        'org.change.reject',
        'org.change.cancel',
        'org.change.schedule',
        'org.change.apply',
        'org.change.delete',
        'org.change_item.read',
        'org.change_item.create',
        'org.change_item.delete',
        'org.change_approval.read',
        // 02.10 calendar assignments
        'org.calendar_assignment.read',
        'org.calendar_assignment.create',
        'org.calendar_assignment.update',
        'org.calendar_assignment.status',
        'org.calendar_assignment.delete',
    ];

    private const SENSITIVE = [
        'org.master.update',
        'org.legal_entity.create',
        'org.legal_entity.update',
        'org.legal_entity.status',
        'org.legal_entity.delete',
        'org.location.create',
        'org.location.update',
        'org.location.status',
        'org.location.delete',
        'org.calendar.create',
        'org.calendar.update',
        'org.calendar.status',
        'org.calendar.delete',
        'org.enterprise.create',
        'org.enterprise.update',
        'org.enterprise.status',
        'org.enterprise.delete',
        'org.unit.create',
        'org.unit.update',
        'org.unit.status',
        'org.unit.delete',
        'org.unit_position.create',
        'org.unit_position.update',
        'org.unit_position.delete',
        'org.unit_assignment.create',
        'org.unit_assignment.update',
        'org.unit_assignment.delete',
        'org.org_location.create',
        'org.org_location.update',
        'org.org_location.status',
        'org.org_location.delete',
        'org.location_type.create',
        'org.work_location.create',
        'org.work_location.delete',
        'org.financial.create',
        'org.financial.update',
        'org.financial.status',
        'org.financial.delete',
        'org.financial_gl.create',
        'org.financial_gl.update',
        'org.financial_gl.delete',
        'org.financial_allocation.create',
        'org.financial_allocation.update',
        'org.financial_allocation.delete',
        'org.hierarchy.create',
        'org.hierarchy.update',
        'org.hierarchy.status',
        'org.hierarchy.delete',
        'org.hierarchy_node.create',
        'org.hierarchy_node.update',
        'org.hierarchy_node.delete',
        'org.hierarchy_edge.create',
        'org.hierarchy_edge.update',
        'org.hierarchy_edge.delete',
        'org.reporting.create',
        'org.reporting.update',
        'org.reporting.delete',
        'org.reporting_leadership.create',
        'org.reporting_leadership.update',
        'org.reporting_leadership.delete',
        'org.change.create',
        'org.change.update',
        'org.change.submit',
        'org.change.approve',
        'org.change.reject',
        'org.change.cancel',
        'org.change.schedule',
        'org.change.apply',
        'org.change.delete',
        'org.change_item.create',
        'org.change_item.delete',
        'org.calendar_assignment.create',
        'org.calendar_assignment.update',
        'org.calendar_assignment.status',
        'org.calendar_assignment.delete',
    ];

    private const READS = [
        'org.master.read',
        'org.legal_entity.read',
        'org.location.read',
        'org.calendar.read',
        'org.enterprise.read',
        'org.unit.read',
        'org.unit_position.read',
        'org.unit_assignment.read',
        'org.org_location.read',
        'org.location_type.read',
        'org.work_location.read',
        'org.financial.read',
        'org.financial_gl.read',
        'org.financial_allocation.read',
        'org.hierarchy.read',
        'org.hierarchy_node.read',
        'org.hierarchy_edge.read',
        'org.reporting.read',
        'org.reporting_leadership.read',
        'org.chart.read',
        'org.change.read',
        'org.change_item.read',
        'org.change_approval.read',
        'org.calendar_assignment.read',
    ];

    private const GRANTS = [
        'super_administrator' => self::CODES,
        'security_administrator' => self::CODES,
        // Read only. The pickers need the lists; the tenant master data is not
        // theirs to edit.
        'tenant_administrator' => self::READS,
    ];

    public function run(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasColumn('permissions', 'code')) {
            return;
        }

        $groupId = Schema::hasTable('permission_groups')
            ? PermissionGroup::firstOrCreate(['name' => self::GROUP])->id
            : null;

        $permissions = [];

        foreach (self::CODES as $code) {
            $parts = explode('.', $code);
            $action = array_pop($parts);

            $permission = Permission::query()->where('code', $code)->orWhere('name', $code)->first()
                ?: new Permission();

            $permission->fill([
                'name' => $code,
                'code' => $code,
                'resource' => implode('.', $parts),
                'action' => $action,
                'level' => 'ADMINISTRATION',
                'group_id' => $groupId,
                'description' => ucwords(str_replace(['.', '_'], ' ', $code)),
                'is_sensitive' => in_array($code, self::SENSITIVE, true),
                'is_active' => true,
            ])->save();

            $permissions[$code] = $permission;
        }

        $this->grant($permissions);
    }

    private function grant(array $permissions): void
    {
        if (! Schema::hasTable('roles') || ! Schema::hasColumn('roles', 'code')) {
            return;
        }

        $hasEffect = Schema::hasColumn('role_permissions', 'effect');

        foreach (self::GRANTS as $roleCode => $codes) {
            $role = Role::query()->where('code', $roleCode)->first();

            if (! $role) {
                continue;
            }

            foreach ($codes as $code) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $role->id, 'permission_id' => $permissions[$code]->id],
                    $hasEffect
                        ? ['effect' => 'ALLOW', 'inherit_to_children' => ! $permissions[$code]->is_sensitive]
                        : []
                );
            }
        }
    }
}
