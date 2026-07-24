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
        if (!Schema::hasColumn('users', 'unit')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('unit')->nullable()->after('company_code')->index();
            });
        }

        if (!Schema::hasColumn('salary_slips', 'unit')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->string('unit')->nullable()->after('department')->index();
            });
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasColumn('users', 'unit')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('unit');
            });
        }

        if (Schema::hasColumn('salary_slips', 'unit')) {
            Schema::table('salary_slips', function (Blueprint $table) {
                $table->dropColumn('unit');
            });
        }
    }
};
