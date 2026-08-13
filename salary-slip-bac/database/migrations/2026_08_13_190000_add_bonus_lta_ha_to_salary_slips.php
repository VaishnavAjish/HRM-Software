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
        if (!Schema::hasColumn('salary_slips', 'bonus')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->float('bonus')->default(0)->after('product_incentive');
            });
        }

        if (!Schema::hasColumn('salary_slips', 'lta')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->float('lta')->default(0)->after('bonus');
            });
        }

        if (!Schema::hasColumn('salary_slips', 'ha')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->float('ha')->default(0)->after('lta');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('salary_slips', 'ha')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->dropColumn('ha');
            });
        }

        if (Schema::hasColumn('salary_slips', 'lta')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->dropColumn('lta');
            });
        }

        if (Schema::hasColumn('salary_slips', 'bonus')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->dropColumn('bonus');
            });
        }
    }
};
