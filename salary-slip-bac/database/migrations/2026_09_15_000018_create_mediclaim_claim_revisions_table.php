<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_claim_revisions — one row per resubmission after
 * RETURNED_FOR_CORRECTION, holding a full JSON snapshot of the claim's
 * prior state. Append-only: rows are never updated or deleted.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_claim_revisions')) {
            Schema::create('mediclaim_claim_revisions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('claim_id')->constrained('mediclaim_claims')->cascadeOnDelete();
                $table->unsignedInteger('revision_number');
                $table->json('prior_state');
                $table->text('reason')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->unique(['claim_id', 'revision_number'], 'mc_claim_revisions_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_claim_revisions');
    }
};
