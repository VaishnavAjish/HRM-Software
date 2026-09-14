<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_reviewer_assignments — primary/backup reviewer per
 * company/policy/role, active date range. `GET /reviews/pending` resolves
 * the acting user's queue through active rows here; the module stays
 * hidden from the frontend nav (`mediclaim_ready`) until at least one
 * active, non-backup row exists per required role per company.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_reviewer_assignments')) {
            Schema::create('mediclaim_reviewer_assignments', function (Blueprint $table) {
                $table->id();
                $table->string('company_code');
                $table->foreignId('policy_id')->nullable()->constrained('mediclaim_policies')->nullOnDelete();
                $table->string('role'); // coordinator, committee, hr_verification, director, settlement
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->boolean('is_backup')->default(false);
                $table->date('active_from')->nullable();
                $table->date('active_to')->nullable();
                $table->string('status')->default('active'); // active, inactive
                $table->timestamps();

                $table->index(['company_code', 'role', 'is_backup'], 'mc_reviewer_assignments_company_role_backup_idx');
                $table->index('user_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_reviewer_assignments');
    }
};
