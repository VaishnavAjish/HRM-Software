<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * legal_entity_addresses — addresses for a legal entity profile (DOMAIN 02.02).
 *
 * Multiple addresses per profile with type classification.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('legal_entity_addresses')) {
            return;
        }

        Schema::create('legal_entity_addresses', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('legal_entity_profile_id');
            $table->string('type', 40); // registered, correspondence, branch, factory, warehouse, other
            $table->text('address_line_1');
            $table->text('address_line_2')->nullable();
            $table->string('city', 120)->nullable();
            $table->string('state', 120)->nullable();
            $table->char('country_code', 2)->nullable();
            $table->string('postal_code', 20)->nullable();
            $table->boolean('is_primary')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->index('legal_entity_profile_id');
            $table->index('type');
            $table->index('is_active');

            $table->foreign('legal_entity_profile_id')->references('id')->on('legal_entity_profiles')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_entity_addresses');
    }
};