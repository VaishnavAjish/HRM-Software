<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * legal_entity_registrations — tax and statutory registrations (DOMAIN 02.02).
 *
 * Multiple registrations per legal entity profile, by type and jurisdiction.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('legal_entity_registrations')) {
            return;
        }

        Schema::create('legal_entity_registrations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('legal_entity_profile_id');
            $table->string('type', 60); // gst, pan, tan, esi, pf, professional_tax, etc.
            $table->string('jurisdiction', 100)->nullable(); // state, country, region
            $table->string('registration_number', 100);
            $table->date('registration_date')->nullable();
            $table->date('expiry_date')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->unique(['legal_entity_profile_id', 'type', 'jurisdiction', 'registration_number']);
            $table->index('legal_entity_profile_id');
            $table->index('type');
            $table->index('is_active');

            $table->foreign('legal_entity_profile_id')->references('id')->on('legal_entity_profiles')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_entity_registrations');
    }
};