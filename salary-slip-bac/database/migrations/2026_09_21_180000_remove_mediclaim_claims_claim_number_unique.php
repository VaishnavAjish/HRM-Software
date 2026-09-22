<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('mediclaim_claims')) {
            // Drop unique constraint in PostgreSQL
            DB::statement('ALTER TABLE mediclaim_claims DROP CONSTRAINT IF EXISTS mediclaim_claims_claim_number_unique');
            DB::statement('DROP INDEX IF EXISTS mediclaim_claims_claim_number_unique');

            // Add non-unique index for fast lookup
            DB::statement('CREATE INDEX IF NOT EXISTS mc_claims_claim_number_idx ON mediclaim_claims (claim_number)');
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('mediclaim_claims')) {
            DB::statement('DROP INDEX IF EXISTS mc_claims_claim_number_idx');
        }
    }
};
