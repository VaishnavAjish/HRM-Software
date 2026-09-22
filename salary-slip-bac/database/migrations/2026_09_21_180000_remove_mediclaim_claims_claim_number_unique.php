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
            $driver = DB::getDriverName();

            try {
                if ($driver === 'pgsql') {
                    DB::statement('ALTER TABLE mediclaim_claims DROP CONSTRAINT IF EXISTS mediclaim_claims_claim_number_unique');
                    DB::statement('DROP INDEX IF EXISTS mediclaim_claims_claim_number_unique');
                } elseif ($driver === 'sqlite') {
                    DB::statement('DROP INDEX IF EXISTS mediclaim_claims_claim_number_unique');
                } else {
                    Schema::table('mediclaim_claims', function (Blueprint $table) {
                        $table->dropUnique('mediclaim_claims_claim_number_unique');
                    });
                }
            } catch (\Throwable $e) {
            }

            try {
                if ($driver === 'sqlite') {
                    DB::statement('CREATE INDEX IF NOT EXISTS mc_claims_claim_number_idx ON mediclaim_claims (claim_number)');
                } else {
                    Schema::table('mediclaim_claims', function (Blueprint $table) {
                        $table->index('claim_number', 'mc_claims_claim_number_idx');
                    });
                }
            } catch (\Throwable $e) {
            }
        }
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (Schema::hasTable('mediclaim_claims')) {
            try {
                if (DB::getDriverName() === 'sqlite') {
                    DB::statement('DROP INDEX IF EXISTS mc_claims_claim_number_idx');
                } else {
                    Schema::table('mediclaim_claims', function (Blueprint $table) {
                        $table->dropIndex('mc_claims_claim_number_idx');
                    });
                }
            } catch (\Throwable $e) {
            }
        }
    }
};
