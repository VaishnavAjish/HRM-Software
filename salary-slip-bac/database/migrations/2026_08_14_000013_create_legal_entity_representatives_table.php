<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * legal_entity_representatives — authorized signatories and representatives (DOMAIN 02.02).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('legal_entity_representatives')) {
            return;
        }

        Schema::create('legal_entity_representatives', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('legal_entity_profile_id');
            $table->string('name', 190);
            $table->string('designation', 100)->nullable();
            $table->string('email', 190)->nullable();
            $table->string('phone', 32)->nullable();
            $table->string('pan', 20)->nullable();
            $table->string('din', 20)->nullable(); // Director Identification Number
            $table->string('type', 40); // director, authorized_signatory, company_secretary, compliance_officer, other
            $table->boolean('is_primary')->default(false);
            $table->boolean('is_active')->default(true);
            $table->date('appointment_date')->nullable();
            $table->date('cessation_date')->nullable();
            $table->timestamps();

            $table->index('legal_entity_profile_id');
            $table->index('type');
            $table->index('is_active');

            $table->foreign('legal_entity_profile_id')->references('id')->on('legal_entity_profiles')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_entity_representatives');
    }
};