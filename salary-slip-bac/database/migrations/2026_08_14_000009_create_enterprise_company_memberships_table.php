<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * enterprise_company_memberships — which companies belong to which enterprise (DOMAIN 02.01).
 *
 * A company belongs to at most one enterprise. The membership is effective-dated
 * so restructures can be scheduled. Ownership percentage tracks the enterprise's
 * stake in the company.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('enterprise_company_memberships')) {
            return;
        }

        Schema::create('enterprise_company_memberships', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id');
            $table->unsignedBigInteger('company_id');
            $table->decimal('ownership_percentage', 5, 2)->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['enterprise_id', 'company_id']);
            $table->index('company_id');
            $table->index(['effective_from', 'effective_to']);
            $table->index('is_active');

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->cascadeOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('enterprise_company_memberships');
    }
};