<?php

namespace Database\Seeders;

use App\Models\AuthorizationRoleAssignment;
use App\Models\Permission;
use App\Models\PermissionGroup;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class RbacSeeder extends Seeder
{
    /** Canonical domain.resource.action permission catalogue. */
    private const CATALOGUE = [
        'Authorization Administration' => [
            'admin.authorization.simulate', 'admin.authorization.configure',
            'admin.authorization.audit.read', 'admin.authorization.audit.export',
            'admin.authorization.analytics.read',
            'admin.permission.read', 'admin.permission.create', 'admin.permission.update', 'admin.permission.delete',
            'admin.role.read', 'admin.role.create', 'admin.role.update', 'admin.role.delete', 'admin.role.clone', 'admin.role.assign',
            'admin.user.read', 'admin.user.create', 'admin.user.update', 'admin.user.delete',
            'admin.user.lock', 'admin.user.unlock', 'admin.user.assign_role',
            'admin.user.assign_permission', 'admin.user.reset_password',
            'admin.policy.read', 'admin.policy.create', 'admin.policy.update', 'admin.policy.publish', 'admin.policy.rollback',
            'admin.access_request.read', 'admin.access_request.approve', 'admin.access_request.revoke',
            'admin.emergency_access.approve', 'admin.delegation.manage', 'admin.access_review.manage',
        ],
        'HR' => [
            'hr.employee.read', 'hr.employee.create', 'hr.employee.update', 'hr.employee.delete',
            'hr.employee.import', 'hr.employee.export', 'hr.employee.print',
            'hr.employee.salary.read', 'hr.employee.salary.update',
            'hr.employee.bank_account.reveal', 'hr.employee.aadhaar.reveal',
            'hr.appointment.read', 'hr.appointment.create', 'hr.appointment.update', 'hr.appointment.delete',
            'hr.appointment.approve', 'hr.appointment.export', 'hr.appointment.print',
            'hr.profile.read', 'hr.profile.update',
            'hr.attendance.read', 'hr.attendance.update', 'hr.attendance.import',
            'hr.shift.read', 'hr.shift.create', 'hr.shift.update', 'hr.shift.delete', 'hr.shift.assign',
            'hr.department.read', 'hr.department.create', 'hr.department.update', 'hr.department.delete',
        ],
        'Payroll' => [
            'payroll.payslip.read', 'payroll.payslip.create', 'payroll.payslip.update', 'payroll.payslip.delete',
            'payroll.run.execute', 'payroll.run.approve', 'payroll.report.export', 'payroll.report.print',
        ],
        'Recruitment' => [
            'recruitment.candidate.read', 'recruitment.candidate.create', 'recruitment.candidate.update',
            'recruitment.candidate.delete', 'recruitment.candidate.export', 'recruitment.candidate.assign',
            'recruitment.trial_form.read', 'recruitment.trial_form.create',
            'recruitment.trial_form.update', 'recruitment.trial_form.delete',
        ],
        'Documents' => [
            'document.file.read', 'document.file.upload', 'document.file.download',
            'document.file.update', 'document.file.delete', 'document.file.restore',
        ],
        'Workflow' => [
            'workflow.transition.start', 'workflow.transition.submit', 'workflow.transition.approve',
            'workflow.transition.reject', 'workflow.transition.cancel', 'workflow.transition.reopen',
            'workflow.transition.override',
        ],
        'UI and Analytics' => [
            'ui.admin.dashboard.view', 'ui.admin.employees.view', 'ui.admin.appointments.view',
            'ui.admin.salary.view', 'ui.admin.attendance.view', 'ui.admin.reports.view',
            'ui.admin.authorization.view', 'ui.agent.dashboard.view', 'ui.employee.dashboard.view',
            'dashboard.hr.employee_count.view', 'dashboard.payroll.total_cost.view',
            'admin.configuration.read', 'admin.configuration.update',
            'admin.organization.read', 'admin.organization.create',
            'admin.organization.update', 'admin.organization.delete',
        ],
        'Self Service' => [
            'self.profile.read', 'self.profile.update', 'self.payslip.read',
            'self.document.read', 'self.document.upload',
        ],
    ];

    public function run(): void
    {
        $permissions = [];
        foreach (self::CATALOGUE as $groupName => $codes) {
            $group = PermissionGroup::firstOrCreate(['name' => $groupName]);
            foreach ($codes as $code) {
                $parts = explode('.', $code);
                $action = array_pop($parts);
                $permission = Permission::query()->where('code', $code)->orWhere('name', $code)->first() ?: new Permission();
                $permission->fill([
                    'name' => $code,
                    'code' => $code,
                    'resource' => implode('.', $parts),
                    'action' => $action,
                    'level' => $this->level($code),
                    'group_id' => $group->id,
                    'description' => ucwords(str_replace(['.', '_'], ' ', $code)),
                    'is_sensitive' => $this->sensitive($code),
                    'is_active' => true,
                ])->save();
                $permissions[$code] = $permission;
            }
        }

        $roles = [
            'super_administrator' => $this->role('Super Admin', 'super_administrator', 'SYSTEM', null, 'GLOBAL', true),
            'security_administrator' => $this->role('Security Administrator', 'security_administrator', 'SYSTEM', null, 'GLOBAL', true),
            'tenant_administrator' => $this->role('Admin', 'tenant_administrator', 'SYSTEM', null, 'TENANT', true),
            'hr_manager' => $this->role('HR Manager', 'hr_manager', 'BUSINESS', null, 'COMPANY'),
            'recruitment_manager' => $this->role('Recruitment Manager', 'recruitment_manager', 'BUSINESS', null, 'COMPANY'),
            'employee' => $this->role('Employee', 'employee', 'BUSINESS', null, 'SELF'),
        ];

        $securityCodes = array_values(array_filter(array_keys($permissions), fn ($code) =>
            str_starts_with($code, 'admin.') || $code === 'ui.admin.authorization.view'
        ));
        $adminCodes = array_values(array_filter(array_keys($permissions), fn ($code) =>
            !str_starts_with($code, 'admin.authorization.') &&
            !str_starts_with($code, 'admin.policy.') &&
            !in_array($code, ['admin.user.assign_permission', 'admin.user.delete'], true) &&
            !str_contains($code, '.aadhaar.reveal') &&
            !str_contains($code, '.bank_account.reveal')
        ));
        $hrCodes = array_values(array_filter(array_keys($permissions), fn ($code) =>
            str_starts_with($code, 'hr.') || str_starts_with($code, 'document.') ||
            str_starts_with($code, 'workflow.') || in_array($code, ['ui.admin.employees.view', 'ui.admin.appointments.view', 'ui.admin.dashboard.view'], true)
        ));
        $recruitmentCodes = array_values(array_filter(array_keys($permissions), fn ($code) =>
            str_starts_with($code, 'recruitment.') || str_starts_with($code, 'hr.appointment.') ||
            str_starts_with($code, 'document.') || str_starts_with($code, 'ui.agent.')
        ));
        $employeeCodes = array_values(array_filter(array_keys($permissions), fn ($code) =>
            str_starts_with($code, 'self.') || str_starts_with($code, 'ui.employee.') || $code === 'hr.profile.read'
        ));

        $this->grant($roles['super_administrator'], array_keys($permissions), $permissions);
        $this->grant($roles['security_administrator'], $securityCodes, $permissions);
        $this->grant($roles['tenant_administrator'], $adminCodes, $permissions);
        $this->grant($roles['hr_manager'], $hrCodes, $permissions);
        $this->grant($roles['recruitment_manager'], $recruitmentCodes, $permissions);
        $this->grant($roles['employee'], $employeeCodes, $permissions);

        // Sensitive reveal stays an explicit deny for broad business roles; a
        // narrowly approved role or policy must grant it deliberately.
        foreach (['hr.employee.aadhaar.reveal', 'hr.employee.bank_account.reveal'] as $code) {
            if (isset($permissions[$code])) {
                DB::table('role_permissions')->updateOrInsert(
                    ['role_id' => $roles['tenant_administrator']->id, 'permission_id' => $permissions[$code]->id],
                    ['effect' => 'DENY', 'inherit_to_children' => false]
                );
            }
        }

        $this->populateCatalog($permissions);
        $this->migrateLegacyAssignments($roles);
    }

    private function role(
        string $name,
        string $code,
        string $roleType,
        ?string $tenantId,
        string $defaultScope,
        bool $system = false
    ): Role {
        $role = Role::query()->where('code', $code)->orWhere('name', $name)->first() ?: new Role();
        $role->fill([
            'name' => $name, 'code' => $code, 'description' => "$name authorization role",
            'type' => $system ? 'System' : 'Custom', 'role_type' => $roleType,
            'tenant_id' => $tenantId, 'is_active' => true, 'is_system' => $system,
            'is_assignable' => true, 'is_sensitive' => $system,
            'requires_approval' => $system && $code !== 'super_administrator',
            'default_scope_type' => $defaultScope, 'status' => 'ACTIVE',
        ])->save();
        return $role;
    }

    private function grant(Role $role, array $codes, array $permissions): void
    {
        foreach ($codes as $code) {
            $obligations = null;
            if ($role->code !== 'super_administrator' && in_array($code, ['hr.employee.read', 'hr.appointment.read'], true)) {
                $obligations = json_encode([
                    'hiddenFields' => ['aadhar_card_no', 'aadhaar_full', 'bank_account_no'],
                    'maskedFields' => ['pan_card_no', 'mobile_number'],
                ]);
            }
            DB::table('role_permissions')->updateOrInsert(
                ['role_id' => $role->id, 'permission_id' => $permissions[$code]->id],
                ['effect' => 'ALLOW', 'obligations' => $obligations, 'inherit_to_children' => !$permissions[$code]->is_sensitive]
            );
        }
    }

    private function migrateLegacyAssignments(array $roles): void
    {
        if (!Schema::hasTable('authorization_role_assignments')) {
            return;
        }
        User::query()->where('is_deleted', false)->orderBy('id')->chunkById(200, function ($users) use ($roles) {
            foreach ($users as $user) {
                [$role, $scopeType, $scopeId] = match ((int) $user->role) {
                    0 => [$roles['super_administrator'], 'GLOBAL', null],
                    1, 2 => [$roles['tenant_administrator'], 'TENANT', $user->company_code],
                    4 => [$roles['recruitment_manager'], 'COMPANY', $user->company_code],
                    default => [$roles['employee'], 'SELF', (string) $user->id],
                };
                $user->roles()->syncWithoutDetaching([$role->id]);
                AuthorizationRoleAssignment::firstOrCreate([
                    'user_id' => $user->id, 'role_id' => $role->id,
                    'tenant_id' => $scopeType === 'GLOBAL' ? null : $user->company_code,
                    'scope_type' => $scopeType, 'scope_id' => $scopeId,
                ], [
                    'valid_from' => now(), 'assignment_source' => 'LEGACY_MIGRATION',
                    'assignment_reason' => 'Migrated from legacy numeric role', 'status' => 'ACTIVE',
                ]);
            }
        });
    }

    private function level(string $code): string
    {
        return str_starts_with($code, 'ui.') || str_starts_with($code, 'dashboard.')
            ? 'UI'
            : (str_starts_with($code, 'admin.') ? 'ADMINISTRATION' : (str_starts_with($code, 'workflow.') ? 'WORKFLOW' : 'ACTION'));
    }

    private function sensitive(string $code): bool
    {
        return str_contains($code, '.reveal') || str_contains($code, '.delete') ||
            str_contains($code, '.approve') || str_contains($code, '.configure') ||
            str_contains($code, '.publish') || str_contains($code, '.rollback');
    }

    private function populateCatalog(array $permissions): void
    {
        if (!Schema::hasTable('authorization_resource_actions')) {
            return;
        }

        $modulesMeta = [
            'Authorization Administration' => ['code' => 'admin', 'name' => 'Access Control', 'order' => 10],
            'HR' => ['code' => 'hr', 'name' => 'Human Resources', 'order' => 20],
            'Payroll' => ['code' => 'payroll', 'name' => 'Payroll Management', 'order' => 30],
            'Recruitment' => ['code' => 'recruitment', 'name' => 'Recruitment & Hiring', 'order' => 40],
            'Documents' => ['code' => 'document', 'name' => 'Document Management', 'order' => 50],
            'Workflow' => ['code' => 'workflow', 'name' => 'Workflows & Approvals', 'order' => 60],
            'UI and Analytics' => ['code' => 'ui', 'name' => 'Dashboards & Analytics', 'order' => 70],
            'Self Service' => ['code' => 'self', 'name' => 'Employee Self Service', 'order' => 80],
        ];

        $actionsMeta = [
            'read' => ['name' => 'View', 'category' => 'READ', 'primary' => true, 'order' => 10],
            'create' => ['name' => 'Create', 'category' => 'WRITE', 'primary' => true, 'order' => 20],
            'update' => ['name' => 'Update', 'category' => 'WRITE', 'primary' => true, 'order' => 30],
            'delete' => ['name' => 'Delete', 'category' => 'DESTRUCTIVE', 'primary' => true, 'order' => 40],
            'execute' => ['name' => 'Execute', 'category' => 'WRITE', 'primary' => true, 'order' => 50],
            'approve' => ['name' => 'Approve', 'category' => 'GOVERNANCE', 'primary' => false, 'order' => 60],
            'export' => ['name' => 'Export', 'category' => 'READ', 'primary' => false, 'order' => 70],
            'import' => ['name' => 'Import', 'category' => 'WRITE', 'primary' => false, 'order' => 80],
            'print' => ['name' => 'Print', 'category' => 'READ', 'primary' => false, 'order' => 90],
            'reveal' => ['name' => 'Reveal', 'category' => 'SENSITIVE', 'primary' => false, 'order' => 100],
            'assign' => ['name' => 'Assign', 'category' => 'WRITE', 'primary' => false, 'order' => 110],
            'clone' => ['name' => 'Clone', 'category' => 'WRITE', 'primary' => false, 'order' => 120],
            'lock' => ['name' => 'Lock', 'category' => 'GOVERNANCE', 'primary' => false, 'order' => 130],
            'unlock' => ['name' => 'Unlock', 'category' => 'GOVERNANCE', 'primary' => false, 'order' => 140],
            'assign_role' => ['name' => 'Assign Role', 'category' => 'GOVERNANCE', 'primary' => false, 'order' => 150],
            'assign_permission' => ['name' => 'Assign Permission', 'category' => 'GOVERNANCE', 'primary' => false, 'order' => 160],
            'reset_password' => ['name' => 'Reset Password', 'category' => 'SENSITIVE', 'primary' => false, 'order' => 170],
            'configure' => ['name' => 'Configure', 'category' => 'GOVERNANCE', 'primary' => false, 'order' => 180],
            'simulate' => ['name' => 'Simulate', 'category' => 'READ', 'primary' => false, 'order' => 190],
            'publish' => ['name' => 'Publish', 'category' => 'GOVERNANCE', 'primary' => false, 'order' => 200],
            'rollback' => ['name' => 'Rollback', 'category' => 'GOVERNANCE', 'primary' => false, 'order' => 210],
            'manage' => ['name' => 'Manage', 'category' => 'WRITE', 'primary' => false, 'order' => 220],
            'view' => ['name' => 'View', 'category' => 'READ', 'primary' => true, 'order' => 10],
            'start' => ['name' => 'Start', 'category' => 'WRITE', 'primary' => false, 'order' => 230],
            'submit' => ['name' => 'Submit', 'category' => 'WRITE', 'primary' => false, 'order' => 240],
            'reject' => ['name' => 'Reject', 'category' => 'GOVERNANCE', 'primary' => false, 'order' => 250],
            'cancel' => ['name' => 'Cancel', 'category' => 'WRITE', 'primary' => false, 'order' => 260],
            'reopen' => ['name' => 'Reopen', 'category' => 'WRITE', 'primary' => false, 'order' => 270],
            'override' => ['name' => 'Override', 'category' => 'SENSITIVE', 'primary' => false, 'order' => 280],
        ];

        foreach (self::CATALOGUE as $groupName => $codes) {
            $modInfo = $modulesMeta[$groupName] ?? ['code' => \Illuminate\Support\Str::slug($groupName), 'name' => $groupName, 'order' => 99];

            DB::table('authorization_modules')->updateOrInsert(
                ['tenant_id' => null, 'code' => $modInfo['code']],
                ['name' => $modInfo['name'], 'description' => $groupName, 'display_order' => $modInfo['order'], 'is_active' => true, 'updated_at' => now(), 'created_at' => now()]
            );

            $moduleId = DB::table('authorization_modules')->whereNull('tenant_id')->where('code', $modInfo['code'])->value('id');

            foreach ($codes as $code) {
                if (!isset($permissions[$code])) {
                    continue;
                }
                $permission = $permissions[$code];

                $parts = explode('.', $code);
                $actionCode = array_pop($parts);
                $resourceCode = implode('.', $parts);

                $lastPart = end($parts);
                $resourceName = ucwords(str_replace(['.', '_'], ' ', $lastPart));

                DB::table('authorization_resources')->updateOrInsert(
                    ['code' => $resourceCode],
                    [
                        'module_id' => $moduleId,
                        'name' => $resourceName,
                        'description' => $resourceName . ' resource',
                        'resource_type' => 'ENTITY',
                        'is_sensitive' => $permission->is_sensitive,
                        'display_order' => 10,
                        'is_active' => true,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );

                $resourceId = DB::table('authorization_resources')->where('code', $resourceCode)->value('id');

                $actMeta = $actionsMeta[$actionCode] ?? [
                    'name' => ucwords(str_replace('_', ' ', $actionCode)),
                    'category' => 'WRITE',
                    'primary' => false,
                    'order' => 500,
                ];

                DB::table('authorization_actions')->updateOrInsert(
                    ['code' => $actionCode],
                    [
                        'name' => $actMeta['name'],
                        'category' => $actMeta['category'],
                        'is_sensitive' => in_array($actMeta['category'], ['SENSITIVE', 'DESTRUCTIVE'], true),
                        'is_primary_column' => $actMeta['primary'],
                        'display_order' => $actMeta['order'],
                        'is_active' => true,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );

                $actionId = DB::table('authorization_actions')->where('code', $actionCode)->value('id');

                DB::table('authorization_resource_actions')->updateOrInsert(
                    [
                        'resource_id' => $resourceId,
                        'action_id' => $actionId,
                    ],
                    [
                        'permission_id' => $permission->id,
                        'requires_approval' => false,
                        'is_sensitive' => (bool) $permission->is_sensitive,
                        'updated_at' => now(),
                        'created_at' => now(),
                    ]
                );
            }
        }
    }
}
