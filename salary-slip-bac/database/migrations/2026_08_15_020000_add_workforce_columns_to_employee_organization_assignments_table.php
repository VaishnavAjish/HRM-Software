<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employee_organization_assignments', function (Blueprint $table) {
            if (!Schema::hasColumn('employee_organization_assignments', 'location_id')) {
                $table->unsignedBigInteger('location_id')->nullable()->after('position_id');
                $table->foreign('location_id')->references('id')->on('locations')->nullOnDelete();
                $table->index('location_id');
            }

            if (!Schema::hasColumn('employee_organization_assignments', 'cost_center_id')) {
                $table->unsignedBigInteger('cost_center_id')->nullable()->after('location_id');
                $table->foreign('cost_center_id')->references('id')->on('financial_organizations')->nullOnDelete();
                $table->index('cost_center_id');
            }

            if (!Schema::hasColumn('employee_organization_assignments', 'manager_user_id')) {
                $table->unsignedBigInteger('manager_user_id')->nullable()->after('cost_center_id');
                $table->foreign('manager_user_id')->references('id')->on('users')->nullOnDelete();
                $table->index('manager_user_id');
            }

            if (!Schema::hasColumn('employee_organization_assignments', 'assignment_percentage')) {
                $table->decimal('assignment_percentage', 5, 2)->default(100)->after('manager_user_id');
            }

            if (!Schema::hasColumn('employee_organization_assignments', 'fte')) {
                $table->decimal('fte', 5, 2)->nullable()->after('assignment_percentage');
            }

            if (!Schema::hasColumn('employee_organization_assignments', 'change_reason')) {
                $table->string('change_reason', 255)->nullable()->after('notes');
            }
        });
    }

    public function down(): void
    {
        Schema::table('employee_organization_assignments', function (Blueprint $table) {
            foreach (['location_id', 'cost_center_id', 'manager_user_id'] as $fk) {
                if (Schema::hasColumn('employee_organization_assignments', $fk)) {
                    $table->dropForeign(['employee_organization_assignments_' . $fk . '_foreign']);
                }
            }

            $table->dropColumn(array_filter([
                'location_id', 'cost_center_id', 'manager_user_id',
                'assignment_percentage', 'fte', 'change_reason',
            ], fn ($col) => Schema::hasColumn('employee_organization_assignments', $col)));
        });
    }
};
