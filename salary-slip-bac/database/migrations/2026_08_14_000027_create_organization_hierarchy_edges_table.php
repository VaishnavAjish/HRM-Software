<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_hierarchy_edges — edges between hierarchy nodes (DOMAIN 02.06).
 *
 * Supports multiple parents only for Matrix and Dotted-Line hierarchies.
 * Validates no self-parenting, no cycles, and no duplicate active edges.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_hierarchy_edges')) {
            return;
        }

        Schema::create('organization_hierarchy_edges', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('hierarchy_id');
            $table->unsignedBigInteger('parent_node_id');
            $table->unsignedBigInteger('child_node_id');
            $table->string('edge_type', 30)->default('primary'); // primary, secondary, dotted, matrix
            $table->boolean('is_active')->default(true);
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->unique(['hierarchy_id', 'parent_node_id', 'child_node_id', 'edge_type']);
            $table->index('hierarchy_id');
            $table->index('parent_node_id');
            $table->index('child_node_id');
            $table->index('edge_type');
            $table->index('is_active');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('hierarchy_id')->references('id')->on('organization_hierarchies')->cascadeOnDelete();
            $table->foreign('parent_node_id')->references('id')->on('organization_hierarchy_nodes')->cascadeOnDelete();
            $table->foreign('child_node_id')->references('id')->on('organization_hierarchy_nodes')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_hierarchy_edges');
    }
};