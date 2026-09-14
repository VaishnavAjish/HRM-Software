<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_settlements — one-or-more settlement rows per claim
 * (`sequence_no` per claim), since real insurance settlements are often
 * phased rather than a single payout.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_settlements')) {
            Schema::create('mediclaim_settlements', function (Blueprint $table) {
                $table->id();
                $table->foreignId('claim_id')->constrained('mediclaim_claims')->cascadeOnDelete();
                $table->unsignedInteger('sequence_no');
                $table->decimal('settled_amount', 12, 2);
                $table->date('settlement_date')->nullable();
                $table->string('settlement_mode')->nullable();
                $table->string('reference_number')->nullable();
                $table->text('remarks')->nullable();
                $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->unique(['claim_id', 'sequence_no'], 'mc_settlements_claim_sequence_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_settlements');
    }
};
