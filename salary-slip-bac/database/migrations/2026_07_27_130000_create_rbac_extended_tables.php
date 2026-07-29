<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('type')->default('Office'); // Office, Factory, Warehouse
            $table->string('country')->nullable();
            $table->string('state')->nullable();
            $table->string('city')->nullable();
            $table->timestamps();
        });

        Schema::create('branches', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('code')->unique();
            $table->foreignId('location_id')->nullable()->constrained('locations')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('teams', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->foreignId('department_id')->nullable()->constrained('departments')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('approval_levels', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->unsignedInteger('level')->default(1);
            $table->enum('type', ['Auto Approval', 'Manual Approval'])->default('Manual Approval');
            $table->timestamps();
        });

        // Generic store for the "dimension" style permissions (menu, page, module,
        // action, row, field, location, warehouse, branch). One table instead of
        // nine near-identical ones — each row is "for this role, this dimension,
        // this key, set this value" (e.g. dimension=page, key=reports, value=view_only).
        Schema::create('permission_dimensions', function (Blueprint $table) {
            $table->id();
            $table->enum('dimension', [
                'menu', 'page', 'module', 'action', 'row', 'field',
                'location', 'warehouse', 'branch',
            ]);
            $table->foreignId('role_id')->constrained('roles')->cascadeOnDelete();
            $table->string('key_name');
            $table->string('value');
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->unique(['dimension', 'role_id', 'key_name']);
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('action'); // CREATE, UPDATE, DELETE, ASSIGN
            $table->string('module'); // Roles, PermissionMatrix, UserRoleAssignment, ...
            $table->json('old_value')->nullable();
            $table->json('new_value')->nullable();
            $table->string('ip_address')->nullable();
            $table->string('user_agent')->nullable();
            $table->timestamps();

            $table->index(['module']);
            $table->index(['created_at']);
        });

        // Added as separate, guarded ALTERs (rather than one Blueprint call with
        // an inline unique()) because SQLite's doctrine/dbal-driven column-add
        // path for unique columns rebuilds the table, which does not play well
        // with re-running this in one shot — see the 130100 follow-up migration.
        if (!Schema::hasColumn('settings', 'key')) {
            Schema::table('settings', function (Blueprint $table) {
                $table->string('key')->nullable()->after('id');
            });
        }
        if (!Schema::hasColumn('settings', 'value')) {
            Schema::table('settings', function (Blueprint $table) {
                $table->text('value')->nullable()->after('key');
            });
        }
    }

    public function down(): void
    {
        Schema::table('settings', function (Blueprint $table) {
            $table->dropColumn(['key', 'value']);
        });
        Schema::dropIfExists('audit_logs');
        Schema::dropIfExists('permission_dimensions');
        Schema::dropIfExists('approval_levels');
        Schema::dropIfExists('teams');
        Schema::dropIfExists('branches');
        Schema::dropIfExists('locations');
    }
};
