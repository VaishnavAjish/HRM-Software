<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_document_links — polymorphic join between the existing
 * `documents` table and whichever Mediclaim record a document belongs to
 * (claim, rule book, card, intimation, member change request). Deliberately
 * not a bespoke claim-only document table: DocumentService/DocumentViewerModal
 * stay reusable unmodified, and DocumentAuthorizer gets one new branch that
 * resolves access through this link rather than the document's own owner
 * columns. Columns are named `linkable_*` (not Laravel's default `*able_*`
 * from `morphs()`) so the composite index below can be explicitly named
 * per this codebase's migration convention.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_document_links')) {
            Schema::create('mediclaim_document_links', function (Blueprint $table) {
                $table->id();
                $table->foreignId('document_id')->constrained('documents')->cascadeOnDelete();
                $table->string('linkable_type');
                $table->unsignedBigInteger('linkable_id');
                $table->string('document_role')->nullable(); // e.g. hospital_bill, discharge_summary, prescription
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['linkable_type', 'linkable_id'], 'mc_document_links_linkable_idx');
                $table->index('document_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_document_links');
    }
};
