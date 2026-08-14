<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_locations — physical locations (DOMAIN 02.04).
 *
 * Extends the existing locations table with enterprise scope, location types,
 * geographic zones, and effective-dated work location mappings.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_locations')) {
            return;
        }

        Schema::create('organization_locations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id');
            $table->unsignedBigInteger('location_type_id')->nullable();
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->string('code', 60);
            $table->string('name', 190);
            $table->string('kind', 30); // branch, office, plant, factory, warehouse, store, worksite, remote
            $table->string('status', 20)->default('active'); // active, inactive, closed
            $table->text('address')->nullable();
            $table->string('city', 120)->nullable();
            $table->string('state', 120)->nullable();
            $table->char('country_code', 2)->nullable();
            $table->string('postal_code', 20)->nullable();
            $table->string('timezone', 64)->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->string('contact_email', 190)->nullable();
            $table->string('contact_phone', 32)->nullable();
            $table->unsignedBigInteger('zone_id')->nullable();
            $table->unsignedBigInteger('region_id')->nullable();
            $table->unsignedBigInteger('territory_id')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->unique(['enterprise_id', 'company_id', 'code']);
            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('location_type_id');
            $table->index('parent_id');
            $table->index('kind');
            $table->index('status');
            $table->index('zone_id');
            $table->index('region_id');
            $table->index('territory_id');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            $table->foreign('location_type_id')->references('id')->on('organization_location_types')->nullOnDelete();
            $table->foreign('parent_id')->references('id')->on('organization_locations')->nullOnDelete();
            $table->foreign('zone_id')->references('id')->on('organization_locations')->nullOnDelete();
            $table->foreign('region_id')->references('id')->on('organization_locations')->nullOnDelete();
            $table->foreign('territory_id')->references('id')->on('organization_locations')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_locations');
    }
};