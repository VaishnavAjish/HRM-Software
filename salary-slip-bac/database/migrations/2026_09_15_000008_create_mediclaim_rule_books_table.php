<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_rule_books — draft/published/archived rule-book metadata. The
 * actual trilingual (EN/HI/GU) PDF files are uploaded through the existing
 * DocumentService and joined in via `mediclaim_document_links`, never
 * stored directly on this row.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_rule_books')) {
            Schema::create('mediclaim_rule_books', function (Blueprint $table) {
                $table->id();
                $table->string('company_code')->nullable();
                $table->string('version_label')->nullable();
                $table->string('status')->default('draft'); // draft, published, archived
                $table->date('effective_from')->nullable();
                $table->date('effective_to')->nullable();
                $table->timestamp('published_at')->nullable();
                $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['status', 'effective_from'], 'mc_rule_books_status_effective_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_rule_books');
    }
};
