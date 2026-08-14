<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_hierarchy_nodes — nodes in a hierarchy (DOMAIN 02.06).
 *
 * Each node references a record from the appropriate table based on hierarchy type.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_hierarchy_nodes')) {
            return;
        }

        Schema::create('organization_hierarchy_nodes', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('hierarchy_id');
            $table->string('node_type', 40); // enterprise, company, legal_entity, organization_unit, organization_location, financial_organization, position, user
            $table->unsignedBigInteger('node_id'); // ID of the referenced record
            $table->string('code', 60)->nullable();
            $table->string('name', 190);
            $table->json('metadata')->nullable(); // additional data like vacancy, headcount, etc.
            $table->boolean('is_active')->default(true);
            $table->timestamps();

            $table->unique(['hierarchy_id', 'node_type', 'node_id']);
            $table->index('hierarchy_id');
            $table->index('node_type');
            $table->index('node_id');
            $table->index('is_active');

            $table->foreign('hierarchy_id')->references('id')->on('organization_hierarchies')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_hierarchy_nodes');
    }
};