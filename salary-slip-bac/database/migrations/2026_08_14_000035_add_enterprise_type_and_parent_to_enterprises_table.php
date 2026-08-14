<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Enterprise group structure (DOMAIN 02.01).
 *
 * An enterprise can be a standalone, a group (holding), a holding, a parent
 * company, or a subsidiary. `enterprise_type` classifies it and
 * `parent_enterprise_id` nests a subsidiary under its parent, so the
 * group/holding/parent/subsidiary vocabulary from the domain has one shape.
 * A code is unique globally; the parent relationship is optional and cannot
 * point at the record itself (the service enforces the cycle rule).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('enterprises')) {
            return;
        }

        Schema::table('enterprises', function (Blueprint $table) {
            if (! Schema::hasColumn('enterprises', 'enterprise_type')) {
                $table->string('enterprise_type', 30)->default('standalone')->after('code'); // standalone, group, holding, parent, subsidiary
            }
            if (! Schema::hasColumn('enterprises', 'parent_enterprise_id')) {
                $table->unsignedBigInteger('parent_enterprise_id')->nullable()->after('enterprise_type');
            }
        });

        if (! Schema::hasColumn('enterprises', 'parent_enterprise_id')) {
            return;
        }

        Schema::table('enterprises', function (Blueprint $table) {
            if (! Schema::hasIndex('enterprises', 'enterprises_parent_enterprise_id_index')) {
                $table->index('parent_enterprise_id');
            }

            try {
                $table->foreign('parent_enterprise_id')
                    ->references('id')->on('enterprises')
                    ->nullOnDelete();
            } catch (Throwable) {
                // The constraint may already exist on a re-run.
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('enterprises')) {
            return;
        }

        Schema::table('enterprises', function (Blueprint $table) {
            foreach (['parent_enterprise_id', 'enterprise_type'] as $column) {
                if (Schema::hasColumn('enterprises', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
