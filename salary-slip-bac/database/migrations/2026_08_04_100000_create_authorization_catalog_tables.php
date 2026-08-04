<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('authorization_modules')) {
            Schema::create('authorization_modules', function (Blueprint $table) {
                $table->id();
                $table->string('tenant_id')->nullable();
                $table->string('code', 64);
                $table->string('name');
                $table->text('description')->nullable();
                $table->string('icon', 64)->nullable();
                $table->unsignedBigInteger('legacy_group_id')->nullable();
                $table->integer('display_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->unique(['tenant_id', 'code']);
            });
        }

        if (!Schema::hasTable('authorization_resources')) {
            Schema::create('authorization_resources', function (Blueprint $table) {
                $table->id();
                $table->string('tenant_id')->nullable();
                $table->unsignedBigInteger('module_id');
                $table->unsignedBigInteger('parent_id')->nullable();
                $table->string('code', 190)->unique();
                $table->string('name');
                $table->text('description')->nullable();
                $table->string('resource_type', 32)->default('ENTITY');
                $table->string('model_class')->nullable();
                $table->boolean('is_sensitive')->default(false);
                $table->boolean('supports_row_security')->default(false);
                $table->boolean('supports_field_security')->default(false);
                $table->integer('display_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
                $table->index('module_id');
            });
        }

        if (!Schema::hasTable('authorization_actions')) {
            Schema::create('authorization_actions', function (Blueprint $table) {
                $table->id();
                $table->string('code', 64)->unique();
                $table->string('name');
                $table->text('description')->nullable();
                $table->string('category', 32)->default('WRITE');
                $table->boolean('is_sensitive')->default(false);
                $table->boolean('is_primary_column')->default(false);
                $table->integer('display_order')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('authorization_resource_actions')) {
            Schema::create('authorization_resource_actions', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('resource_id');
                $table->unsignedBigInteger('action_id');
                $table->unsignedBigInteger('permission_id')->nullable();
                $table->boolean('requires_approval')->default(false);
                $table->boolean('is_sensitive')->default(false);
                $table->timestamps();
                $table->unique(['resource_id', 'action_id']);
                $table->index('permission_id');
            });
        }

        if (!Schema::hasTable('authorization_access_request_approvals')) {
            Schema::create('authorization_access_request_approvals', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('access_request_id');
                $table->smallInteger('step');
                $table->string('approver_type', 32);
                $table->unsignedBigInteger('approver_id')->nullable();
                $table->string('status', 24)->default('PENDING');
                $table->text('decision_reason')->nullable();
                $table->timestamp('decided_at')->nullable();
                $table->timestamp('escalated_at')->nullable();
                $table->unsignedBigInteger('escalated_to')->nullable();
                $table->timestamps();
                $table->unique(['access_request_id', 'step']);
            });
        }

        if (!Schema::hasTable('authorization_permission_audit_logs')) {
            Schema::create('authorization_permission_audit_logs', function (Blueprint $table) {
                $table->id();
                $table->uuid('event_id')->unique();
                $table->string('tenant_id')->nullable();
                $table->unsignedBigInteger('actor_id')->nullable();
                $table->string('subject_type', 64);
                $table->string('subject_id', 190)->nullable();
                $table->string('subject_label')->nullable();
                $table->string('change_type', 64);
                $table->string('permission_code', 190)->nullable();
                $table->string('old_state', 64)->nullable();
                $table->string('new_state', 64)->nullable();
                $table->json('old_values')->nullable();
                $table->json('new_values')->nullable();
                $table->string('scope_type', 32)->nullable();
                $table->string('scope_id', 190)->nullable();
                $table->text('business_reason')->nullable();
                $table->string('request_id', 190)->nullable();
                $table->string('ip_address', 45)->nullable();
                $table->timestamps();
                $table->index(['subject_type', 'subject_id']);
                $table->index('actor_id');
                $table->index('created_at');
            });
        }
    }

    public function down(): void
    {
        foreach ([
            'authorization_permission_audit_logs',
            'authorization_access_request_approvals',
            'authorization_resource_actions',
            'authorization_actions',
            'authorization_resources',
            'authorization_modules',
        ] as $table) {
            Schema::dropIfExists($table);
        }
    }
};
