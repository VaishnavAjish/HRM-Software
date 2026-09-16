<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Individual rule-book entries — replaces PDF file storage for this feature.
 * Each row is one rule's text, ordered within its parent rule book via
 * sort_order.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_rule_book_items')) {
            Schema::create('mediclaim_rule_book_items', function (Blueprint $table) {
                $table->id();
                $table->foreignId('rule_book_id')->constrained('mediclaim_rule_books')->cascadeOnDelete();
                $table->text('rule_text');
                $table->unsignedInteger('sort_order')->default(0);
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['rule_book_id', 'sort_order'], 'mc_rule_book_items_book_sort_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_rule_book_items');
    }
};
