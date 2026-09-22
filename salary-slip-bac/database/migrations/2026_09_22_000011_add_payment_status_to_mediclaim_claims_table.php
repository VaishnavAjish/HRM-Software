<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Payment tracking for Accounts: separate from `status` (the review/
 * settlement workflow) because a claim can sit at SETTLED/CLOSED for a
 * while before Accounts actually disburses the money at month-end — this
 * column is Accounts' own "have we paid this out yet" flag, not another
 * workflow stage `ClaimWorkflowService` transitions through.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mediclaim_claims', function (Blueprint $table) {
            if (! Schema::hasColumn('mediclaim_claims', 'payment_status')) {
                $table->string('payment_status')->default('pending')->after('settled_at');
            }
            if (! Schema::hasColumn('mediclaim_claims', 'payment_completed_at')) {
                $table->timestamp('payment_completed_at')->nullable()->after('payment_status');
            }
            if (! Schema::hasColumn('mediclaim_claims', 'payment_completed_by')) {
                $table->foreignId('payment_completed_by')->nullable()->after('payment_completed_at')->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('mediclaim_claims', function (Blueprint $table) {
            if (Schema::hasColumn('mediclaim_claims', 'payment_completed_by')) {
                $table->dropConstrainedForeignId('payment_completed_by');
            }
            foreach (['payment_completed_at', 'payment_status'] as $col) {
                if (Schema::hasColumn('mediclaim_claims', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
