<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('users', 'company_code')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('company_code')->default('nidhi-impex')->after('emp_code')->index();
            });
        }

        if (!Schema::hasColumn('salary_slips', 'company_code')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->string('company_code')->default('nidhi-impex')->after('year')->index();
            });
        }

        DB::table('users')
            ->whereNull('company_code')
            ->update(['company_code' => 'nidhi-impex']);

        DB::table('salary_slips')
            ->whereNull('company_code')
            ->update(['company_code' => 'nidhi-impex']);
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('users', 'company_code')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('company_code');
            });
        }

        if (Schema::hasColumn('salary_slips', 'company_code')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->dropColumn('company_code');
            });
        }
    }
};
