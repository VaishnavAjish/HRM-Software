<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * legal_entity_documents — documents attached to a legal entity (DOMAIN 02.02).
 *
 * Incorporation certificate, registration certificate, tax registration,
 * statutory licences and the like. A document row references an existing
 * document upload where applicable; `document_kind` classifies it and
 * expiry/effective dates track validity without deleting history.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('legal_entity_documents')) {
            return;
        }

        Schema::create('legal_entity_documents', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('legal_entity_id');
            $table->string('document_kind', 40); // incorporation, registration, tax, statutory, board_resolution, bank_proof, other
            $table->string('title', 190)->nullable();
            $table->unsignedBigInteger('document_id')->nullable();
            $table->string('reference_number', 100)->nullable();
            $table->date('issued_on')->nullable();
            $table->date('expires_on')->nullable();
            $table->boolean('is_active')->default(true);
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index('legal_entity_id');
            $table->index('document_kind');
            $table->index('document_id');
            $table->index('is_active');

            $table->foreign('legal_entity_id')->references('id')->on('legal_entities')->cascadeOnDelete();
            $table->foreign('document_id')->references('id')->on('documents')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('legal_entity_documents');
    }
};
