<?php

use App\Models\AuthorizationRoleAssignment;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('roles') || ! Schema::hasTable('permissions') || ! Schema::hasTable('role_permissions')) {
            return;
        }

        // 1. Get or create agent & recruitment_manager roles
        $agentRole = Role::firstOrCreate(['code' => 'agent'], [
            'name' => 'Agent',
            'description' => 'Agent authorization role',
            'type' => 'Custom',
            'role_type' => 'BUSINESS',
            'is_active' => true,
            'status' => 'ACTIVE',
            'default_scope_type' => 'COMPANY',
        ]);

        $recruitmentManagerRole = Role::firstOrCreate(['code' => 'recruitment_manager'], [
            'name' => 'Recruitment Manager',
            'description' => 'Recruitment Manager authorization role',
            'type' => 'Custom',
            'role_type' => 'BUSINESS',
            'is_active' => true,
            'status' => 'ACTIVE',
            'default_scope_type' => 'COMPANY',
        ]);

        $rolesToUpdate = [$agentRole, $recruitmentManagerRole];

        // 2. Target permission codes for agent operations
        $permissionsToGrant = [
            'hr.appointment.read',
            'hr.appointment.create',
            'hr.appointment.update',
            'hr.appointment.delete',
            'recruitment.candidate.read',
            'recruitment.candidate.create',
            'recruitment.candidate.update',
            'recruitment.candidate.delete',
            'recruitment.trial_form.read',
            'recruitment.trial_form.create',
            'recruitment.trial_form.update',
            'recruitment.trial_form.delete',
            'document.file.read',
            'document.file.upload',
            'document.file.download',
            'ui.agent.dashboard.view',
            'ui.portals',
            'ui.portals.agent',
            'ui.portals.agent_dashboard',
            'ui.portals.agent_trial_forms',
            'ui.portals.agent_trial_forms.create',
            'ui.portals.agent_appointments',
            'ui.portals.agent_appointments.create',
        ];

        // Ensure permissions exist in permissions table
        foreach ($permissionsToGrant as $code) {
            $parts = explode('.', $code);
            $action = array_pop($parts);
            $resource = implode('.', $parts);

            $exists = DB::table('permissions')->where('code', $code)->orWhere('name', $code)->first();
            if (! $exists) {
                DB::table('permissions')->insert([
                    'name' => $code,
                    'code' => $code,
                    'resource' => $resource,
                    'action' => $action,
                    'level' => str_starts_with($code, 'ui.') ? 'UI' : 'ACTION',
                    'description' => ucwords(str_replace(['.', '_'], ' ', $code)),
                    'is_active' => true,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
        }

        $permissionMap = DB::table('permissions')
            ->whereIn('code', $permissionsToGrant)
            ->orWhereIn('name', $permissionsToGrant)
            ->pluck('id', 'code')
            ->all();

        foreach ($rolesToUpdate as $r) {
            foreach ($permissionsToGrant as $pCode) {
                $pId = $permissionMap[$pCode] ?? DB::table('permissions')->where('code', $pCode)->orWhere('name', $pCode)->value('id');
                if ($pId) {
                    DB::table('role_permissions')->updateOrInsert(
                        ['role_id' => $r->id, 'permission_id' => $pId],
                        ['effect' => 'ALLOW', 'inherit_to_children' => true]
                    );
                }
            }
        }

        // 3. Assign all users where type = 'agent' or role = 4 to both agent & recruitment_manager roles
        User::query()
            ->where('is_deleted', false)
            ->where(function ($q) {
                $q->where('type', 'agent')
                  ->orWhere('role', 4);
            })
            ->chunkById(100, function ($users) use ($agentRole, $recruitmentManagerRole) {
                foreach ($users as $user) {
                    if (Schema::hasTable('user_roles')) {
                        $user->roles()->syncWithoutDetaching([$agentRole->id, $recruitmentManagerRole->id]);
                    }

                    if (Schema::hasTable('authorization_role_assignments')) {
                        AuthorizationRoleAssignment::firstOrCreate([
                            'user_id' => $user->id,
                            'role_id' => $agentRole->id,
                            'scope_type' => 'COMPANY',
                            'scope_id' => $user->company_code,
                        ], [
                            'valid_from' => now(),
                            'assignment_source' => 'AGENT_PERMISSION_FIX',
                            'assignment_reason' => 'Granted agent permissions',
                            'status' => 'ACTIVE',
                        ]);

                        AuthorizationRoleAssignment::firstOrCreate([
                            'user_id' => $user->id,
                            'role_id' => $recruitmentManagerRole->id,
                            'scope_type' => 'COMPANY',
                            'scope_id' => $user->company_code,
                        ], [
                            'valid_from' => now(),
                            'assignment_source' => 'AGENT_PERMISSION_FIX',
                            'assignment_reason' => 'Granted recruitment manager permissions',
                            'status' => 'ACTIVE',
                        ]);
                    }
                }
            });
    }

    public function down(): void
    {
    }
};
