<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * B6 fix-forward: the B1 plan text describes `mediclaim_cards` as already
 * having a `document_id` FK to `documents`, but the actual B1 migration
 * (2026_09_15_000013_create_mediclaim_cards_table.php) never added that
 * column — only `MediclaimCardService::generate()`'s TODO(B6) comment and
 * the plan text assumed it existed. B6 needs it to attach the rendered card
 * PDF, so it is added here as its own additive migration rather than editing
 * the original B1 file (which may already have been migrated in some
 * environments) — guarded with hasColumn() so it is a safe no-op if a
 * future environment somehow already has it.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('mediclaim_cards') && ! Schema::hasColumn('mediclaim_cards', 'document_id')) {
            Schema::table('mediclaim_cards', function (Blueprint $table) {
                $table->foreignId('document_id')->nullable()->after('card_number')
                    ->constrained('documents')->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mediclaim_cards') && Schema::hasColumn('mediclaim_cards', 'document_id')) {
            Schema::table('mediclaim_cards', function (Blueprint $table) {
                $table->dropForeign(['document_id']);
                $table->dropColumn('document_id');
            });
        }
    }
};
