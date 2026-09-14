<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_claim_assignments — per-stage reviewer assignment, including
 * the confidentiality acknowledgement a manager must record (timestamp +
 * IP/UA) before ClaimWorkflowService::managerDecision() will accept a
 * decision from them. reassignReviewer() supersedes the old row via
 * `superseded_by_assignment_id` rather than mutating it in place.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_claim_assignments')) {
            Schema::create('mediclaim_claim_assignments', function (Blueprint $table) {
                $table->id();
                $table->foreignId('claim_id')->constrained('mediclaim_claims')->cascadeOnDelete();

                // MANAGER_REVIEW, COORDINATOR_VERIFICATION, COMMITTEE_RECOMMENDATION,
                // HR_ELIGIBILITY_VERIFICATION, DIRECTOR_FINAL_APPROVAL
                $table->string('stage');

                $table->foreignId('assigned_to')->constrained('users')->cascadeOnDelete();
                $table->string('status')->default('ACTIVE'); // ACTIVE, SUPERSEDED, COMPLETED
                $table->timestamp('confidentiality_ack_at')->nullable();
                $table->string('confidentiality_ack_ip')->nullable();
                $table->string('confidentiality_ack_user_agent', 512)->nullable();
                $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('reassigned_reason')->nullable();
                $table->foreignId('superseded_by_assignment_id')->nullable()
                    ->constrained('mediclaim_claim_assignments')->nullOnDelete();
                $table->timestamps();

                $table->index(['claim_id', 'stage', 'status'], 'mc_claim_assignments_claim_stage_status_idx');
                $table->index(['assigned_to', 'status'], 'mc_claim_assignments_assignee_status_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_claim_assignments');
    }
};
