<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_organization_assignments', function (Blueprint $table) {
            if (!Schema::hasColumn('employee_organization_assignments', 'designation_id')) {
                $table->unsignedBigInteger('designation_id')->nullable()->after('position_id');
                $table->foreign('designation_id')->references('id')->on('designations')->nullOnDelete();
                $table->index('designation_id');
            }
        });
    }

    public function down(): void
    {
        Schema::table('employee_organization_assignments', function (Blueprint $table) {
            if (Schema::hasColumn('employee_organization_assignments', 'designation_id')) {
                $table->dropForeign(['designation_id']);
            }

            if (Schema::hasColumn('employee_organization_assignments', 'designation_id')) {
                $table->dropColumn('designation_id');
            }
        });
    }
};
