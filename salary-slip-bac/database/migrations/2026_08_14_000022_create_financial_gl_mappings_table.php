<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * financial_gl_mappings — General Ledger mappings for financial organizations (DOMAIN 02.05).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('financial_gl_mappings')) {
            return;
        }

        Schema::create('financial_gl_mappings', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('financial_organization_id');
            $table->string('gl_account_code', 60);
            $table->string('gl_account_name', 190)->nullable();
            $table->string('mapping_type', 30); // debit, credit, both
            $table->boolean('is_active')->default(true);
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('financial_organization_id');
            $table->index('gl_account_code');
            $table->index('is_active');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('financial_organization_id')->references('id')->on('financial_organizations')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_gl_mappings');
    }
};