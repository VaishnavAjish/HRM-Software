<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_rule_book_languages — the set of languages HR has added for the
 * Mediclaim rule book (not a fixed list). `native_name` is the language's
 * own name written in itself (e.g. "हिन्दी" for Hindi, "ગુજરાતી" for
 * Gujarati) — shown everywhere a rule book's language is displayed.
 * `name` is a plain reference label (e.g. "Hindi") used for admin sorting.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_rule_book_languages')) {
            Schema::create('mediclaim_rule_book_languages', function (Blueprint $table) {
                $table->id();
                $table->string('company_code')->nullable();
                $table->string('name', 60);
                $table->string('native_name', 60)->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->unique(['company_code', 'name'], 'mc_rule_book_languages_company_name_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_rule_book_languages');
    }
};
