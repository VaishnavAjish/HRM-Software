<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * financial_allocation_rules — cost allocation rules (DOMAIN 02.05).
 *
 * Effective-dated rules that validate source/target scope, prevent cross-company
 * allocation unless same enterprise, and require percentages to total 100.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('financial_allocation_rules')) {
            return;
        }

        Schema::create('financial_allocation_rules', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->string('code', 60);
            $table->string('name', 190);
            $table->string('description', 500)->nullable();
            $table->string('status', 20)->default('draft'); // draft, active, inactive, archived
            $table->unsignedBigInteger('source_financial_organization_id');
            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['enterprise_id', 'company_id', 'code']);
            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('source_financial_organization_id');
            $table->index('status');
            $table->index('is_active');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('source_financial_organization_id')->references('id')->on('financial_organizations')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_allocation_rules');
    }
};