<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds department_id to designations so a designation can be scoped to a
 * specific (legacy) department, enabling department-wise designations.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('designations', 'department_id')) {
            return;
        }

        Schema::table('designations', function (Blueprint $table) {
            $table->unsignedBigInteger('department_id')->nullable()->after('job_grade_id');
            $table->index('department_id');
            $table->foreign('department_id')->references('id')->on('departments')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('designations', function (Blueprint $table) {
            $table->dropForeign(['department_id']);
            $table->dropIndex(['department_id']);
            $table->dropColumn('department_id');
        });
    }
};
