<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Enterprises — the enterprise master record (DOMAIN 02.01).
 *
 * An enterprise is a group of companies. The existing `companies` table is the
 * tenant anchor; this table adds the enterprise layer above it. A company
 * belongs to at most one enterprise. The enterprise code is the stable
 * identifier; the company code remains the tenant key.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('enterprises')) {
            return;
        }

        Schema::create('enterprises', function (Blueprint $table) {
            $table->id();
            $table->string('code', 60)->unique();
            $table->string('name', 190);
            $table->string('display_name', 190)->nullable();
            $table->string('registration_number', 100)->nullable();
            $table->string('tax_identification', 100)->nullable();
            $table->date('incorporation_date')->nullable();
            $table->char('country_code', 2)->nullable();
            $table->string('timezone', 64)->nullable()->default('Asia/Kolkata');
            $table->text('primary_address')->nullable();
            $table->string('contact_email', 190)->nullable();
            $table->string('contact_phone', 32)->nullable();
            $table->char('fiscal_year_start', 5)->nullable();
            $table->char('currency', 3)->nullable()->default('INR');
            $table->unsignedBigInteger('logo_document_id')->nullable();
            $table->string('brand_primary_color', 7)->nullable();
            $table->string('brand_secondary_color', 7)->nullable();
            $table->boolean('is_active')->default(true);
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('is_active');
            $table->index(['effective_from', 'effective_to']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('enterprises');
    }
};