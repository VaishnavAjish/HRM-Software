<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Locations — the physical business structure (DOMAIN 02.03 / 02.04).
 *
 * The legacy branches/locations/teams tables were dropped on 2026-08-03 because
 * nothing read them; users.unit and users.branch were plain strings. This is a
 * fresh record-based structure. A location belongs to exactly one company
 * (the tenant), may hang under a parent location, and carries a `kind` — a
 * string column enforced in the service, matching the codebase's dislike of
 * PostgreSQL enums. Unit names are not global ("Ichapur" exists under both
 * companies), hence the compound unique key.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('locations')) {
            return;
        }

        Schema::create('locations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id');
            $table->unsignedBigInteger('parent_id')->nullable();
            $table->string('code', 60);
            $table->string('name', 190);
            $table->string('kind', 20)->default('branch');
            $table->boolean('is_active')->default(true);
            $table->text('address')->nullable();
            $table->string('city', 120)->nullable();
            $table->string('state', 120)->nullable();
            $table->char('country_code', 2)->nullable();
            $table->string('postal_code', 20)->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->string('contact_email', 190)->nullable();
            $table->string('contact_phone', 32)->nullable();
            $table->timestamps();

            $table->unique(['company_id', 'code']);
            $table->index('company_id');
            $table->index('parent_id');
            $table->index('kind');

            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            $table->foreign('parent_id')->references('id')->on('locations')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('locations');
    }
};
