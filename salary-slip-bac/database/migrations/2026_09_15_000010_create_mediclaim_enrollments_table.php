<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_enrollments — one row per employee's enrollment in a policy
 * version. No columns added to `users`; every employee reference here and
 * throughout Mediclaim is an `employee_user_id` FK.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_enrollments')) {
            Schema::create('mediclaim_enrollments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('policy_version_id')->constrained('mediclaim_policy_versions')->cascadeOnDelete();
                $table->foreignId('employee_user_id')->constrained('users')->cascadeOnDelete();
                $table->string('company_code');
                $table->string('status')->default('active'); // active, inactive, suspended, terminated
                $table->date('enrolled_at')->nullable();
                $table->date('terminated_at')->nullable();
                $table->timestamps();

                $table->unique(['policy_version_id', 'employee_user_id'], 'mc_enrollments_policy_employee_unique');
                $table->index(['company_code', 'status'], 'mc_enrollments_company_status_idx');
                $table->index('employee_user_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_enrollments');
    }
};
