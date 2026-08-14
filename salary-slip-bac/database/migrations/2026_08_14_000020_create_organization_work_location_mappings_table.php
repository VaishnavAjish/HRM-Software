<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_work_location_mappings — effective-dated work location assignments (DOMAIN 02.04).
 *
 * Maps organization units, positions, and employees to physical locations.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_work_location_mappings')) {
            return;
        }

        Schema::create('organization_work_location_mappings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('organization_location_id');
            $table->unsignedBigInteger('organization_unit_id')->nullable();
            $table->unsignedBigInteger('position_id')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('mapping_type', 30); // unit, position, employee
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('organization_location_id');
            $table->index('organization_unit_id');
            $table->index('position_id');
            $table->index('user_id');
            $table->index('mapping_type');
            $table->index('is_active');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('organization_location_id')->references('id')->on('organization_locations')->cascadeOnDelete();
            $table->foreign('organization_unit_id')->references('id')->on('organization_units')->cascadeOnDelete();
            $table->foreign('position_id')->references('id')->on('organization_positions')->cascadeOnDelete();
            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_work_location_mappings');
    }
};