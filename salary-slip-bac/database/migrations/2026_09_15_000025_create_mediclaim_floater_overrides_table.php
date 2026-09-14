<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_floater_overrides — audited override of the family floater cap
 * (e.g. the standard ₹3,00,000 limit). ClaimWorkflowService::directorFinalApproval()
 * enforces assertWithinFloater() unless an authorized row here accompanies
 * the decision.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_floater_overrides')) {
            Schema::create('mediclaim_floater_overrides', function (Blueprint $table) {
                $table->id();
                $table->foreignId('enrollment_id')->constrained('mediclaim_enrollments')->cascadeOnDelete();
                $table->foreignId('claim_id')->nullable()->constrained('mediclaim_claims')->nullOnDelete();
                $table->decimal('override_amount', 12, 2);
                $table->text('reason');
                $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('approved_at')->nullable();
                $table->timestamps();

                $table->index('enrollment_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_floater_overrides');
    }
};
