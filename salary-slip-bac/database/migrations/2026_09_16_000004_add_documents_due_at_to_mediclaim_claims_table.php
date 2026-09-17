<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `documents_due_at` — set once at submission (`ClaimWorkflowService::submit()`)
 * to discharge_at/admission_at + 7 days (falling back to the submission
 * instant for claims with neither, e.g. OPD). Drives both the employee-facing
 * "upload within N days" countdown and `mediclaim:remind-missing-documents`'s
 * daily sweep — a claim with no required documents outstanding is simply
 * never selected by that sweep regardless of this date.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('mediclaim_claims') && ! Schema::hasColumn('mediclaim_claims', 'documents_due_at')) {
            Schema::table('mediclaim_claims', function (Blueprint $table) {
                $table->dateTime('documents_due_at')->nullable()->after('discharge_at');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mediclaim_claims') && Schema::hasColumn('mediclaim_claims', 'documents_due_at')) {
            Schema::table('mediclaim_claims', function (Blueprint $table) {
                $table->dropColumn('documents_due_at');
            });
        }
    }
};
