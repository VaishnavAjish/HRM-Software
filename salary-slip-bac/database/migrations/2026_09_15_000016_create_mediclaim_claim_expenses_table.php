<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_claim_expenses — Section E line items by category. The client's
 * running total is UX-only; ClaimWorkflowService::submit() recalculates
 * `mediclaim_claims.total_claimed_amount` from these rows server-side and
 * never trusts a client-supplied total.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_claim_expenses')) {
            Schema::create('mediclaim_claim_expenses', function (Blueprint $table) {
                $table->id();
                $table->foreignId('claim_id')->constrained('mediclaim_claims')->cascadeOnDelete();
                $table->string('category'); // consultation, medicine, diagnostic, hospitalization, surgery, other
                $table->string('description')->nullable();
                $table->decimal('claimed_amount', 12, 2);
                $table->decimal('approved_amount', 12, 2)->nullable();
                $table->decimal('disallowed_amount', 12, 2)->nullable();
                $table->text('disallowed_reason')->nullable();
                $table->date('expense_date')->nullable();
                $table->timestamps();

                $table->index('claim_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_claim_expenses');
    }
};
