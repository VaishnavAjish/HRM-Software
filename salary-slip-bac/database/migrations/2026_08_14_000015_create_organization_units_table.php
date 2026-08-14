<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_units — normalized business structure (DOMAIN 02.03).
 *
 * Replaces the legacy branches/locations/teams tables. A unit can be a
 * Business Unit, Division, Function, Department, Sub-Department, Section,
 * Team, Project Organization, Virtual Organization, or Shared Service Organization.
 * The `type` column classifies it. Parent hierarchy with cycle prevention.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_units')) {
            return;
        }

        Schema::create('organization_units', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->string('code', 60);
            $table->string('name', 190);
            $table->string('type', 40); // business_unit, division, function, department, sub_department, section, team, project_org, virtual_org, shared_service_org
            $table->string('status', 20)->default('active'); // active, inactive, closed
            $table->text('description')->nullable();
            $table->unsignedBigInteger('manager_user_id')->nullable();
            $table->unsignedBigInteger('owner_user_id')->nullable();
            $table->unsignedBigInteger('legacy_department_id')->nullable();
            $table->unsignedBigInteger('legacy_unit_id')->nullable();
            $table->unsignedBigInteger('legacy_branch_id')->nullable();
            $table->unsignedBigInteger('legacy_designation_id')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->unique(['enterprise_id', 'company_id', 'code']);
            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('parent_id');
            $table->index('type');
            $table->index('status');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('parent_id')->references('id')->on('organization_units')->nullOnDelete();
            $table->foreign('manager_user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('owner_user_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('legacy_department_id')->references('id')->on('departments')->nullOnDelete();
            $table->foreign('legacy_unit_id')->references('id')->on('units')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_units');
    }
};