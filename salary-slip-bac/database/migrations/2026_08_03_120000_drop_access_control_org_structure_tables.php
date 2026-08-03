<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Drops the four org-structure tables left orphaned by the removal of the
 * Access Control console.
 *
 * These were reachable only through /api/rbac/{locations,branches,teams,
 * approval-levels}, whose controllers and routes are gone. Nothing in payroll,
 * attendance, documents or HR reads them — `users.unit` and `users.branch` are
 * plain string columns and never referenced `branches.id`.
 *
 * Deliberately NOT dropped, because the Access Control screens were not their
 * only reader:
 *
 *   roles, user_roles          User::roles(); the super-admin grant re-asserted
 *                              by DatabaseSeeder on every run
 *   permissions,               enumerated by GET /v1/authorization/me to build
 *   permission_groups,         the client's permission snapshot at login, and
 *   role_permissions           resolved by AuthorizationEngine
 *   permission_dimensions      GET /my-permissions, plus the AadhaarAccess and
 *                              AadhaarExportAccess gates that decide who may
 *                              see, print or export a full Aadhaar number
 *   audit_logs                 AuditLogger, called from UserController and
 *                              DocumentController for non-RBAC operations
 *   settings                   the admin Dashboard's "main_dashboard" group
 *
 * Dropping any of those would not remove an admin screen, it would remove
 * authorization and audit from the rest of the application.
 */
return new class extends Migration
{
    public function up(): void
    {
        // branches holds an FK to locations, so it goes first.
        Schema::dropIfExists('approval_levels');
        Schema::dropIfExists('teams');
        Schema::dropIfExists('branches');
        Schema::dropIfExists('locations');
    }

    public function down(): void
    {
        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('type')->default('Office');
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

        // Structure only. The six rows these tables held were configuration
        // entered through a screen that no longer exists; rolling back restores
        // somewhere to put them, not the values themselves.
    }
};
