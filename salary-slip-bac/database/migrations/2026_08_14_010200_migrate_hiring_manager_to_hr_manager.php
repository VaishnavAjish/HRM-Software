<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('job_requisitions')) {
            Schema::table('job_requisitions', function (Blueprint $table) {
                if (! Schema::hasColumn('job_requisitions', 'hr_manager_id')) {
                    $table->foreignId('hr_manager_id')->nullable()->after('department_manager_id')
                        ->constrained('users')->nullOnDelete();
                }
            });

            if (Schema::hasColumn('job_requisitions', 'hiring_manager_id') && Schema::hasColumn('job_requisitions', 'hr_manager_id')) {
                DB::table('job_requisitions')
                    ->whereNull('hr_manager_id')
                    ->whereNotNull('hiring_manager_id')
                    ->update(['hr_manager_id' => DB::raw('hiring_manager_id')]);
            }
        }

        if (Schema::hasTable('job_requisition_approval_steps')) {
            DB::table('job_requisition_approval_steps')
                ->where('step_type', 'HIRING_MANAGER')
                ->update(['step_type' => 'HR_MANAGER']);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('job_requisition_approval_steps')) {
            DB::table('job_requisition_approval_steps')
                ->where('step_type', 'HR_MANAGER')
                ->update(['step_type' => 'HIRING_MANAGER']);
        }
    }
};
