<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * legal_entity_profiles — extended legal information for a company (DOMAIN 02.02).
 *
 * One-to-one with companies. The existing `legal_entities` table is the employing
 * entity for payroll; this profile holds the statutory details that don't belong
 * on the company record itself.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('legal_entity_profiles')) {
            return;
        }

        Schema::create('legal_entity_profiles', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('company_id')->unique();
            $table->string('legal_name', 190);
            $table->string('trading_name', 190)->nullable();
            $table->string('corporate_identification_number', 100)->nullable();
            $table->date('incorporation_date')->nullable();
            $table->char('country_code', 2)->nullable();
            $table->text('registered_address')->nullable();
            $table->text('correspondence_address')->nullable();
            $table->string('contact_email', 190)->nullable();
            $table->string('contact_phone', 32)->nullable();
            $table->string('website', 190)->nullable();
            $table->boolean('is_active')->default(true);
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('is_active');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_entity_profiles');
    }
};