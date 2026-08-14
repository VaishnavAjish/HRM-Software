<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Legal entities — the employing entities a company operates under (02.02).
 *
 * The ONBOARDING-PLATFORM-ARCHITECTURE convention is that future HR tables carry
 * a `legal_entity_id` so payroll knows which statutory entity employs a person.
 * This is that table. `is_primary` marks the entity that is the default
 * employing entity for the company; the service refuses to deactivate it while
 * it is primary so a company always keeps a fallback.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('legal_entities')) {
            return;
        }

        Schema::create('legal_entities', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id');
            $table->string('code', 60);
            $table->string('name', 190);
            $table->string('legal_name', 190);
            $table->string('registration_number', 100)->nullable();
            $table->char('country_code', 2);
            $table->string('tax_id', 100)->nullable();
            $table->char('currency', 3)->default('INR');
            $table->char('fiscal_year_start', 5)->nullable();
            $table->text('primary_address')->nullable();
            $table->string('contact_email', 190)->nullable();
            $table->string('contact_phone', 32)->nullable();
            $table->boolean('is_primary')->default(false);
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['company_id', 'code']);
            // PostgreSQL treats NULL as distinct from every value, so a nullable
            // registration number and a unique index coexist safely.
            $table->unique(['company_id', 'registration_number']);
            $table->index('company_id');
            $table->index('is_active');

            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_entities');
    }
};
