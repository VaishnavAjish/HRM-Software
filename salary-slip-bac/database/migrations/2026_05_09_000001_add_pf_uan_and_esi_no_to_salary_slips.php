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
        if (!Schema::hasColumn('salary_slips', 'pf_uan')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->string('pf_uan')->nullable()->after('pf');
            });
        }

        if (!Schema::hasColumn('salary_slips', 'esi_no')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->string('esi_no')->nullable()->after('esi');
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('salary_slips', 'esi_no')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->dropColumn('esi_no');
            });
        }

        if (Schema::hasColumn('salary_slips', 'pf_uan')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->dropColumn('pf_uan');
            });
        }
    }
};
