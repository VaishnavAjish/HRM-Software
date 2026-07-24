<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('salary_slips', 'leave')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->float('leave')->default(0)->after('paid_day');
            });
        }

        if (!Schema::hasColumn('salary_slips', 'a_gross')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->float('a_gross')->default(0)->after('gross_salary');
            });
        }

        if (!Schema::hasColumn('salary_slips', 'bank_ifsc')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->string('bank_ifsc')->nullable()->after('account_no');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('salary_slips', 'bank_ifsc')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->dropColumn('bank_ifsc');
            });
        }

        if (Schema::hasColumn('salary_slips', 'a_gross')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->dropColumn('a_gross');
            });
        }

        if (Schema::hasColumn('salary_slips', 'leave')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->dropColumn('leave');
            });
        }
    }
};
