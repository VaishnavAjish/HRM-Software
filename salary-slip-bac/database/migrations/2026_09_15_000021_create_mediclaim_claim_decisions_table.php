<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_claim_decisions — one append-only row per stage decision
 * (manager, H/I/J/K), holding the free-form per-stage fields (e.g.
 * director's approved amount, HR's eligibility checkboxes) in `fields`
 * JSON so each stage's distinct shape doesn't need its own table.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_claim_decisions')) {
            Schema::create('mediclaim_claim_decisions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('claim_id')->constrained('mediclaim_claims')->cascadeOnDelete();

                // MANAGER_REVIEW, COORDINATOR_VERIFICATION, COMMITTEE_RECOMMENDATION,
                // HR_ELIGIBILITY_VERIFICATION, DIRECTOR_FINAL_APPROVAL
                $table->string('stage');

                $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();

                // approved, rejected, returned, verified, recommended,
                // not_recommended, partially_approved
                $table->string('decision');

                $table->text('remarks')->nullable();
                $table->json('fields')->nullable();
                $table->timestamp('decided_at')->nullable();
                $table->timestamps();

                $table->index(['claim_id', 'stage'], 'mc_claim_decisions_claim_stage_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_claim_decisions');
    }
};
