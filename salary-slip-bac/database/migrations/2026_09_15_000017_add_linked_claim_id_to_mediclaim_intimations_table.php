<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Links an intimation to the claim it was later filed under, once that
 * claim exists. Split from the initial `mediclaim_intimations` migration
 * because `mediclaim_claims` doesn't exist yet at that point.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('mediclaim_intimations', 'linked_claim_id')) {
            Schema::table('mediclaim_intimations', function (Blueprint $table) {
                $table->foreignId('linked_claim_id')->nullable()->after('hospital_id')
                    ->constrained('mediclaim_claims')->nullOnDelete();

                $table->index('linked_claim_id');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('mediclaim_intimations', 'linked_claim_id')) {
            Schema::table('mediclaim_intimations', function (Blueprint $table) {
                $table->dropConstrainedForeignId('linked_claim_id');
            });
        }
    }
};
