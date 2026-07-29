<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Metadata for every uploaded document.
 *
 * Files on disk carry a generated, sanitised name; everything a human might
 * search by — original name, owner, type, version, checksum — lives here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('document_uploads', function (Blueprint $table) {
            $table->id();

            // Owner. user_id is the FK; emp_code/user_name are denormalised so
            // the row still reads correctly if the user is renamed or removed.
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('emp_code')->nullable();
            $table->string('user_name')->nullable();

            $table->string('document_type');           // catalogue slug, e.g. PAN_CARD
            $table->string('document_category')->nullable();

            $table->string('original_name');           // exactly what the user sent
            $table->string('generated_name');          // what is on disk
            $table->string('storage_path');            // relative to public/
            $table->string('extension', 20);
            $table->string('mime_type');
            $table->unsignedBigInteger('size');        // bytes
            $table->string('checksum', 64)->nullable();// sha256 of contents

            $table->unsignedInteger('version')->default(1);

            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('uploaded_at')->nullable();

            $table->timestamps();

            // Search paths: by owner, by type, by name, and the version lookup
            // that the next upload of the same document does on every write.
            $table->index(['user_id', 'document_type', 'version']);
            $table->index(['emp_code', 'document_type']);
            $table->index('document_type');
            $table->index('generated_name');
            $table->index('checksum');
            $table->index('uploaded_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('document_uploads');
    }
};
