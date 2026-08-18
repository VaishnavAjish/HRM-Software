<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds parent_department_id to departments so a department can nest under
 * another one (e.g. IT -> Frontend, Backend). syncFromLegacyDepartments()
 * reads this to link the matching organization_units rows instead of always
 * forcing them flat.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('departments', 'parent_department_id')) {
            return;
        }

        Schema::table('departments', function (Blueprint $table) {
            $table->unsignedBigInteger('parent_department_id')->nullable()->after('unit_id');
            $table->index('parent_department_id');
            $table->foreign('parent_department_id')->references('id')->on('departments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('departments', function (Blueprint $table) {
            $table->dropForeign(['parent_department_id']);
            $table->dropIndex(['parent_department_id']);
            $table->dropColumn('parent_department_id');
        });
    }
};
