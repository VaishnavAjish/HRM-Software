<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Step 1 of moving salary_slips/attendances off the unconstrained (company_code,
 * emp_code) string join onto a real users.id relationship. Additive only: a
 * nullable, indexed user_id on each table. Backfill (hrms:backfill-payroll-user-ids)
 * and FK/NOT NULL enforcement come in later, separate migrations once the data
 * is verified clean.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('salary_slips') && ! Schema::hasColumn('salary_slips', 'user_id')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->unsignedBigInteger('user_id')->nullable();
                $table->index('user_id', 'salary_slips_user_id_index');
            });
        }

        if (Schema::hasTable('attendances') && ! Schema::hasColumn('attendances', 'user_id')) {
            Schema::table('attendances', function (Blueprint $table) {
                $table->unsignedBigInteger('user_id')->nullable();
                $table->index('user_id', 'attendances_user_id_index');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('salary_slips') && Schema::hasColumn('salary_slips', 'user_id')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->dropIndex('salary_slips_user_id_index');
                $table->dropColumn('user_id');
            });
        }

        if (Schema::hasTable('attendances') && Schema::hasColumn('attendances', 'user_id')) {
            Schema::table('attendances', function (Blueprint $table) {
                $table->dropIndex('attendances_user_id_index');
                $table->dropColumn('user_id');
            });
        }
    }
};
