<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_hierarchies — named, effective-dated hierarchy definitions (DOMAIN 02.06).
 *
 * Types: enterprise, legal_entity, business_unit, division, department, location,
 * cost_center, functional, project, matrix, dotted_line.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_hierarchies')) {
            return;
        }

        Schema::create('organization_hierarchies', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->string('code', 60);
            $table->string('name', 190);
            $table->string('type', 40); // enterprise, legal_entity, business_unit, division, department, location, cost_center, functional, project, matrix, dotted_line
            $table->string('status', 20)->default('draft'); // draft, active, inactive, archived
            $table->text('description')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['enterprise_id', 'company_id', 'code']);
            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('type');
            $table->index('status');
            $table->index('is_active');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_hierarchies');
    }
};