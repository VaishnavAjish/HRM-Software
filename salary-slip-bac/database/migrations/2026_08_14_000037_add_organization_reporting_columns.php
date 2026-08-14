<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * DOMAIN 02.07 — add the org-domain mirror columns to reporting_relationships.
 *
 * The base table (2026_08_11) names the FKs employee_user_id/manager_user_id and
 * models state as status/reason. The organization reporting service reads the
 * relationship as employee_id/manager_id/company_id/is_active/notes. Rather than
 * rewrite the ticket escalation engine, this migration adds the org-domain
 * columns and backfills them from the existing values; the model keeps both
 * families in sync from then on, so the partial unique index on
 * (employee_user_id, status='active', relationship_type='primary') still holds.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('reporting_relationships')) {
            return;
        }

        Schema::table('reporting_relationships', function (Blueprint $table) {
            if (! Schema::hasColumn('reporting_relationships', 'employee_id')) {
                $table->unsignedBigInteger('employee_id')->nullable()->after('id');
            }
            if (! Schema::hasColumn('reporting_relationships', 'manager_id')) {
                $table->unsignedBigInteger('manager_id')->nullable()->after('employee_id');
            }
            if (! Schema::hasColumn('reporting_relationships', 'company_id')) {
                $table->unsignedBigInteger('company_id')->nullable()->after('manager_id');
            }
            if (! Schema::hasColumn('reporting_relationships', 'is_active')) {
                $table->boolean('is_active')->default(true)->after('reason');
            }
            if (! Schema::hasColumn('reporting_relationships', 'notes')) {
                $table->text('notes')->nullable()->after('is_active');
            }
        });

        DB::table('reporting_relationships')
            ->whereNull('employee_id')
            ->update(['employee_id' => DB::raw('employee_user_id')]);

        DB::table('reporting_relationships')
            ->whereNull('manager_id')
            ->update(['manager_id' => DB::raw('manager_user_id')]);

        DB::table('reporting_relationships')
            ->where('is_active', true)
            ->update(['is_active' => DB::raw("CASE WHEN status = 'active' THEN true ELSE false END")]);

        DB::table('reporting_relationships')
            ->whereNull('notes')
            ->update(['notes' => DB::raw('reason')]);

        Schema::table('reporting_relationships', function (Blueprint $table) {
            if (! Schema::hasIndex('reporting_relationships', 'reporting_relationships_company_id_index')) {
                $table->index('company_id');
            }
            if (! Schema::hasIndex('reporting_relationships', 'reporting_relationships_is_active_index')) {
                $table->index('is_active');
            }

            if (Schema::hasColumn('reporting_relationships', 'employee_id') && ! Schema::hasIndex('reporting_relationships', 'reporting_relationships_employee_id_index')) {
                $table->index('employee_id');
            }
            if (Schema::hasColumn('reporting_relationships', 'manager_id') && ! Schema::hasIndex('reporting_relationships', 'reporting_relationships_manager_id_index')) {
                $table->index('manager_id');
            }
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('reporting_relationships')) {
            return;
        }

        Schema::table('reporting_relationships', function (Blueprint $table) {
            foreach (['notes', 'is_active', 'company_id', 'manager_id', 'employee_id'] as $column) {
                if (Schema::hasColumn('reporting_relationships', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
