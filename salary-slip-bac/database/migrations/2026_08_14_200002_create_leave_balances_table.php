<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('leave_balances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('leave_type_id')->constrained('leave_types')->cascadeOnDelete();
            $table->foreignId('leave_policy_id')->nullable()->constrained('leave_policies')->nullOnDelete();
            $table->string('leave_year', 16); // e.g., 2024, 2024-2025
            $table->date('leave_year_start');
            $table->date('leave_year_end');
            $table->decimal('opening_balance', 8, 2)->default(0);
            $table->decimal('accrued', 8, 2)->default(0);
            $table->decimal('carried_forward', 8, 2)->default(0);
            $table->decimal('availed', 8, 2)->default(0);
            $table->decimal('encashed', 8, 2)->default(0);
            $table->decimal('lapsed', 8, 2)->default(0);
            $table->decimal('adjusted', 8, 2)->default(0); // manual adjustments
            $table->decimal('current_balance', 8, 2)->default(0);
            $table->decimal('pending_approval', 8, 2)->default(0); // requested but not approved
            $table->date('last_accrual_date')->nullable();
            $table->date('last_carry_forward_date')->nullable();
            $table->boolean('is_frozen')->default(false); // prevent further accruals
            $table->json('accrual_history')->nullable(); // track accrual runs
            $table->json('adjustment_history')->nullable(); // track manual adjustments
            $table->timestamps();

            $table->unique(['user_id', 'leave_type_id', 'leave_year']);
            $table->index(['user_id', 'leave_year', 'current_balance']);
            $table->index(['leave_type_id', 'leave_year', 'is_frozen']);
            $table->index(['leave_policy_id', 'leave_year']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('leave_balances');
    }
};