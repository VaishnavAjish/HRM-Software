<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_positions — positions within organization units (DOMAIN 02.03).
 *
 * Each position has an approved headcount. Employees are assigned to positions
 * through employee_organization_assignments.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_positions')) {
            return;
        }

        Schema::create('organization_positions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_unit_id');
            $table->string('code', 60);
            $table->string('title', 190);
            $table->string('description', 500)->nullable();
            $table->unsignedInteger('approved_headcount')->default(1);
            $table->unsignedInteger('current_headcount')->default(0);
            $table->string('status', 20)->default('active'); // active, inactive, frozen
            $table->unsignedBigInteger('reports_to_position_id')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->unique(['organization_unit_id', 'code']);
            $table->index('organization_unit_id');
            $table->index('reports_to_position_id');
            $table->index('status');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('organization_unit_id')->references('id')->on('organization_units')->cascadeOnDelete();
            $table->foreign('reports_to_position_id')->references('id')->on('organization_positions')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_positions');
    }
};