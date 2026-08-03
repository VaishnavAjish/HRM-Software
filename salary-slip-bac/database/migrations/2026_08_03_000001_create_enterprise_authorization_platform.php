<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('permissions', function (Blueprint $table) {
            $table->string('code')->nullable()->after('name');
            $table->string('resource')->nullable()->after('code');
            $table->string('action', 64)->nullable()->after('resource');
            $table->string('level', 32)->default('ACTION')->after('action');
            $table->boolean('is_sensitive')->default(false)->after('level');
            $table->boolean('is_active')->default(true)->after('is_sensitive');
        });
        Schema::table('permissions', function (Blueprint $table) {
            $table->unique('code', 'permissions_code_unique');
            $table->index(['resource', 'action'], 'permissions_resource_action_index');
        });

        Schema::table('roles', function (Blueprint $table) {
            $table->string('code')->nullable()->after('name');
            $table->text('description')->nullable()->after('code');
            $table->string('role_type', 32)->default('BUSINESS')->after('type');
            $table->string('tenant_id')->nullable()->after('role_type');
            $table->boolean('is_system')->default(false)->after('is_active');
            $table->boolean('is_assignable')->default(true)->after('is_system');
            $table->boolean('is_sensitive')->default(false)->after('is_assignable');
            $table->boolean('requires_approval')->default(false)->after('is_sensitive');
            $table->string('default_scope_type', 32)->default('TENANT')->after('requires_approval');
            $table->string('status', 24)->default('ACTIVE')->after('default_scope_type');
            $table->unsignedInteger('version')->default(1)->after('status');
            $table->foreignId('created_by')->nullable()->after('version')->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->after('created_by')->constrained('users')->nullOnDelete();
        });
        Schema::table('roles', function (Blueprint $table) {
            $table->unique('code', 'roles_code_unique');
            $table->index(['tenant_id', 'status'], 'roles_tenant_status_index');
        });

        Schema::table('role_permissions', function (Blueprint $table) {
            $table->string('effect', 16)->default('ALLOW');
            $table->json('conditions')->nullable();
            $table->json('obligations')->nullable();
            $table->boolean('inherit_to_children')->default(true);
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable();
        });

        Schema::table('user_permissions', function (Blueprint $table) {
            $table->json('conditions')->nullable();
            $table->json('obligations')->nullable();
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable();
        });

        Schema::create('authorization_role_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->string('tenant_id')->nullable();
            $table->string('scope_type', 32)->default('TENANT');
            $table->string('scope_id')->nullable();
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable();
            $table->string('assignment_source', 32)->default('MANUAL');
            $table->text('assignment_reason')->nullable();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status', 24)->default('ACTIVE');
            $table->timestamps();

            $table->index(['user_id', 'tenant_id', 'status'], 'auth_role_assign_user_tenant_idx');
            $table->index(['role_id', 'scope_type', 'scope_id'], 'auth_role_assign_scope_idx');
            $table->index(['valid_until', 'status'], 'auth_role_assign_expiry_idx');
        });

        Schema::create('authorization_role_inheritances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('parent_role_id')->constrained('roles')->cascadeOnDelete();
            $table->foreignId('child_role_id')->constrained('roles')->cascadeOnDelete();
            $table->unsignedTinyInteger('max_depth')->default(8);
            $table->boolean('inherit_sensitive')->default(false);
            $table->timestamps();

            $table->unique(['parent_role_id', 'child_role_id'], 'auth_role_inheritance_unique');
        });

        Schema::create('authorization_policies', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_id')->nullable();
            $table->string('code')->unique();
            $table->string('name');
            $table->text('description')->nullable();
            $table->string('effect', 16); // ALLOW | DENY
            $table->json('subjects')->nullable();
            $table->json('actions');
            $table->json('resources');
            $table->string('scope_type', 32)->default('TENANT');
            $table->string('scope_id')->nullable();
            $table->json('conditions')->nullable();
            $table->json('obligations')->nullable();
            $table->integer('priority')->default(0);
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable();
            $table->string('status', 32)->default('DRAFT');
            $table->unsignedInteger('version')->default(1);
            $table->boolean('audit_required')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();

            $table->index(['tenant_id', 'status', 'priority'], 'auth_policy_lookup_idx');
            $table->index(['valid_from', 'valid_until'], 'auth_policy_validity_idx');
        });

        Schema::create('authorization_policy_versions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('policy_id')->constrained('authorization_policies')->cascadeOnDelete();
            $table->unsignedInteger('version');
            $table->json('snapshot');
            $table->text('change_summary')->nullable();
            $table->foreignId('previous_version_id')->nullable()->constrained('authorization_policy_versions')->nullOnDelete();
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamp('effective_at')->nullable();
            $table->string('deployment_status', 24)->default('PENDING');
            $table->timestamps();

            $table->unique(['policy_id', 'version'], 'auth_policy_version_unique');
        });

        Schema::create('authorization_relationships', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_id')->nullable();
            $table->string('subject_type', 64);
            $table->string('subject_id');
            $table->string('relationship', 64);
            $table->string('resource_type', 64);
            $table->string('resource_id');
            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'subject_type', 'subject_id'], 'auth_relationship_subject_idx');
            $table->index(['resource_type', 'resource_id', 'relationship'], 'auth_relationship_resource_idx');
        });

        Schema::create('authorization_access_requests', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_id')->nullable();
            $table->foreignId('requester_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('target_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('role_id')->nullable()->constrained('roles')->nullOnDelete();
            $table->string('permission_code')->nullable();
            $table->string('scope_type', 32)->default('TENANT');
            $table->string('scope_id')->nullable();
            $table->text('business_reason');
            $table->timestamp('requested_until')->nullable();
            $table->string('status', 24)->default('PENDING');
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('decision_reason')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['tenant_id', 'status', 'created_at'], 'auth_access_request_queue_idx');
        });

        Schema::create('authorization_delegations', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_id')->nullable();
            $table->foreignId('delegator_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('delegate_id')->constrained('users')->cascadeOnDelete();
            $table->json('permission_codes');
            $table->string('scope_type', 32)->default('TENANT');
            $table->string('scope_id')->nullable();
            $table->timestamp('valid_from');
            $table->timestamp('valid_until');
            $table->text('reason');
            $table->string('status', 24)->default('ACTIVE');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['delegate_id', 'status', 'valid_until'], 'auth_delegation_active_idx');
        });

        Schema::create('authorization_emergency_grants', function (Blueprint $table) {
            $table->id();
            $table->uuid('grant_uuid')->unique();
            $table->string('tenant_id')->nullable();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->json('permission_codes');
            $table->string('scope_type', 32)->default('TENANT');
            $table->string('scope_id')->nullable();
            $table->text('reason');
            $table->timestamp('valid_from');
            $table->timestamp('valid_until');
            $table->string('status', 24)->default('ACTIVE');
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['user_id', 'status', 'valid_until'], 'auth_emergency_active_idx');
        });

        Schema::create('authorization_sod_rules', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_id')->nullable();
            $table->string('code')->unique();
            $table->string('name');
            $table->json('conflicting_role_codes')->nullable();
            $table->json('conflicting_permission_codes')->nullable();
            $table->string('enforcement', 24)->default('BLOCK');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('authorization_decision_logs', function (Blueprint $table) {
            $table->id();
            $table->uuid('decision_id')->unique();
            $table->string('tenant_id')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('session_id')->nullable();
            $table->string('action');
            $table->string('resource_type');
            $table->string('resource_id')->nullable();
            $table->string('decision', 16);
            $table->string('reason_code', 64);
            $table->json('matched_policy_ids')->nullable();
            $table->json('failed_conditions')->nullable();
            $table->json('scope')->nullable();
            $table->json('obligations')->nullable();
            $table->string('ip_address')->nullable();
            $table->string('device')->nullable();
            $table->string('request_id')->nullable();
            $table->json('changed_fields')->nullable();
            $table->string('business_reason')->nullable();
            $table->string('authorization_version', 32)->default('v2');
            $table->unsignedInteger('duration_ms')->default(0);
            $table->timestamps();

            $table->index(['tenant_id', 'decision', 'created_at'], 'auth_decision_tenant_idx');
            $table->index(['user_id', 'action', 'created_at'], 'auth_decision_user_idx');
            $table->index(['resource_type', 'resource_id'], 'auth_decision_resource_idx');
        });

        Schema::create('authorization_feature_flags', function (Blueprint $table) {
            $table->id();
            $table->string('tenant_id')->default('*');
            $table->string('key');
            $table->boolean('enabled')->default(false);
            $table->json('configuration')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tenant_id', 'key'], 'auth_feature_flag_unique');
        });

        DB::table('permissions')->whereNull('code')->orderBy('id')->each(function ($permission) {
            $name = strtolower(trim((string) $permission->name));
            $code = preg_replace('/[^a-z0-9._]+/', '.', str_replace(':', '.', $name));
            $parts = explode('.', trim($code, '.'));
            DB::table('permissions')->where('id', $permission->id)->update([
                'code' => trim($code, '.'),
                'resource' => count($parts) > 1 ? implode('.', array_slice($parts, 0, -1)) : ($parts[0] ?? 'legacy'),
                'action' => count($parts) > 1 ? end($parts) : 'access',
            ]);
        });

        DB::table('roles')->whereNull('code')->orderBy('id')->each(function ($role) {
            DB::table('roles')->where('id', $role->id)->update([
                'code' => strtolower(trim(preg_replace('/[^A-Za-z0-9]+/', '_', (string) $role->name), '_')),
                'is_system' => $role->type === 'System',
                'status' => $role->is_active ? 'ACTIVE' : 'DISABLED',
            ]);
        });

        foreach ([
            'authorization_engine_v2' => true,
            'authorization_shadow_mode' => true,
            'authorization_field_security' => true,
            'authorization_row_security' => true,
            'authorization_policy_builder' => true,
            'authorization_access_requests' => true,
            'authorization_emergency_access' => true,
        ] as $key => $enabled) {
            DB::table('authorization_feature_flags')->insert([
                'tenant_id' => '*',
                'key' => $key,
                'enabled' => $enabled,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('authorization_feature_flags');
        Schema::dropIfExists('authorization_decision_logs');
        Schema::dropIfExists('authorization_sod_rules');
        Schema::dropIfExists('authorization_emergency_grants');
        Schema::dropIfExists('authorization_delegations');
        Schema::dropIfExists('authorization_access_requests');
        Schema::dropIfExists('authorization_relationships');
        Schema::dropIfExists('authorization_policy_versions');
        Schema::dropIfExists('authorization_policies');
        Schema::dropIfExists('authorization_role_inheritances');
        Schema::dropIfExists('authorization_role_assignments');

        Schema::table('user_permissions', function (Blueprint $table) {
            $table->dropColumn(['conditions', 'obligations', 'valid_from', 'valid_until']);
        });
        Schema::table('role_permissions', function (Blueprint $table) {
            $table->dropColumn(['effect', 'conditions', 'obligations', 'inherit_to_children', 'valid_from', 'valid_until']);
        });
        Schema::table('roles', function (Blueprint $table) {
            $table->dropUnique('roles_code_unique');
            $table->dropIndex('roles_tenant_status_index');
            $table->dropConstrainedForeignId('created_by');
            $table->dropConstrainedForeignId('updated_by');
            $table->dropColumn([
                'code', 'description', 'role_type', 'tenant_id', 'is_system', 'is_assignable',
                'is_sensitive', 'requires_approval', 'default_scope_type', 'status', 'version',
            ]);
        });
        Schema::table('permissions', function (Blueprint $table) {
            $table->dropUnique('permissions_code_unique');
            $table->dropIndex('permissions_resource_action_index');
            $table->dropColumn(['code', 'resource', 'action', 'level', 'is_sensitive', 'is_active']);
        });
    }
};
