<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * financial_allocation_lines — target lines for allocation rules (DOMAIN 02.05).
 *
 * Each line specifies a target financial organization and percentage. Percentages
 * must total exactly 100 for an active rule.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('financial_allocation_lines')) {
            return;
        }

        Schema::create('financial_allocation_lines', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('allocation_rule_id');
            $table->unsignedBigInteger('target_financial_organization_id');
            $table->decimal('percentage', 5, 2); // e.g., 25.00
            $table->string('basis', 40)->nullable(); // headcount, area, revenue, direct, other
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['allocation_rule_id', 'target_financial_organization_id']);
            $table->index('allocation_rule_id');
            $table->index('target_financial_organization_id');
            $table->index('is_active');

            $table->foreign('allocation_rule_id')->references('id')->on('financial_allocation_rules')->cascadeOnDelete();
            $table->foreign('target_financial_organization_id')->references('id')->on('financial_organizations')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('financial_allocation_lines');
    }
};