<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * employee_organization_assignments — effective-dated employee assignments (DOMAIN 02.03).
 *
 * Links employees to organization units and positions. Updates legacy compatibility
 * fields (users.department, users.unit, users.branch, users.designation) atomically.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('employee_organization_assignments')) {
            return;
        }

        Schema::create('employee_organization_assignments', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('organization_unit_id');
            $table->unsignedBigInteger('position_id')->nullable();
            $table->string('assignment_type', 30)->default('primary'); // primary, secondary, functional, project, matrix
            $table->boolean('is_primary')->default(true);
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'organization_unit_id', 'position_id', 'effective_from']);
            $table->index('user_id');
            $table->index('organization_unit_id');
            $table->index('position_id');
            $table->index('is_primary');
            $table->index('is_active');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('organization_unit_id')->references('id')->on('organization_units')->cascadeOnDelete();
            $table->foreign('position_id')->references('id')->on('organization_positions')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employee_organization_assignments');
    }
};