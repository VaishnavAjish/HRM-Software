<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds unit_id to departments so a department can be scoped under a branch
 * (the existing "Units" table — a named, company-scoped site/branch), giving
 * the org chart a real Company -> Branch -> Department level.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('departments', 'unit_id')) {
            return;
        }

        Schema::table('departments', function (Blueprint $table) {
            $table->unsignedBigInteger('unit_id')->nullable()->after('company_code');
            $table->index('unit_id');
            $table->foreign('unit_id')->references('id')->on('units')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->dropForeign(['unit_id']);
            $table->dropIndex(['unit_id']);
            $table->dropColumn('unit_id');
        });
    }
};
