<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Rule books are no longer PDF uploads — each row now belongs to a language
 * (mediclaim_rule_book_languages) and HR fills it with individual rule text
 * entries one at a time (see mediclaim_rule_book_items). Deleting a language
 * cascades to its rule book(s) — rule-book content is pure admin-authored
 * text, not something that needs historical retention the way claims/cards
 * do.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('mediclaim_rule_books') && ! Schema::hasColumn('mediclaim_rule_books', 'language_id')) {
            Schema::table('mediclaim_rule_books', function (Blueprint $table) {
                $table->foreignId('language_id')->nullable()->after('version_label')
                    ->constrained('mediclaim_rule_book_languages')->cascadeOnDelete();
            });
        }

        if (Schema::hasTable('mediclaim_rule_books') && Schema::hasColumn('mediclaim_rule_books', 'language_id')) {
            DB::statement('DROP INDEX IF EXISTS mc_rule_books_company_lang_status_idx');
            Schema::table('mediclaim_rule_books', function (Blueprint $table) {
                $table->index(['company_code', 'language_id', 'status'], 'mc_rule_books_company_lang_status_idx');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mediclaim_rule_books') && Schema::hasColumn('mediclaim_rule_books', 'language_id')) {
            Schema::table('mediclaim_rule_books', function (Blueprint $table) {
                $table->dropIndex('mc_rule_books_company_lang_status_idx');
                $table->dropConstrainedForeignId('language_id');
            });
        }
    }
};
