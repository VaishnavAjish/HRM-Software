<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Extend reporting_relationships — add new relationship types and effective dates (DOMAIN 02.07).
 *
 * Adds: secondary_manager, functional_manager, project_manager, matrix_manager
 * Keeps lowercase 'primary' compatibility for existing ticket-routing code.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('reporting_relationships')) {
            return;
        }

        Schema::table('reporting_relationships', function (Blueprint $table) {
            if (!Schema::hasColumn('reporting_relationships', 'relationship_type')) {
                $table->string('relationship_type', 30)->default('primary')->after('manager_id');
            }
            if (!Schema::hasColumn('reporting_relationships', 'effective_from')) {
                $table->date('effective_from')->nullable()->after('relationship_type');
            }
            if (!Schema::hasColumn('reporting_relationships', 'effective_to')) {
                $table->date('effective_to')->nullable()->after('effective_from');
            }
            if (!Schema::hasColumn('reporting_relationships', 'is_active')) {
                $table->boolean('is_active')->default(true)->after('effective_to');
            }
            if (!Schema::hasColumn('reporting_relationships', 'notes')) {
                $table->text('notes')->nullable()->after('is_active');
            }
        });

        // Add indexes
        if (!Schema::hasIndex('reporting_relationships', 'reporting_relationships_relationship_type_index')) {
            Schema::table('reporting_relationships', function (Blueprint $table) {
                $table->index('relationship_type');
                $table->index('is_active');
                $table->index(['effective_from', 'effective_to']);
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasTable('reporting_relationships')) {
            return;
        }

        Schema::table('reporting_relationships', function (Blueprint $table) {
            foreach (['notes', 'is_active', 'effective_to', 'effective_from', 'relationship_type'] as $column) {
                if (Schema::hasColumn('reporting_relationships', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};