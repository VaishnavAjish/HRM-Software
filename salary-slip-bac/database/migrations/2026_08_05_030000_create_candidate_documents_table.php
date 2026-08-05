<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('candidate_id')->constrained('candidates')->cascadeOnDelete();
            $table->string('document_type');
            $table->string('original_filename');
            $table->string('file_path');
            $table->string('status')->default('PENDING'); // PENDING, VERIFIED, REJECTED
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('reviewed_at')->nullable();
            $table->text('notes')->nullable();
            $table->text('review_notes')->nullable();
            $table->timestamps();

            $table->index('candidate_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_documents');
    }
};
