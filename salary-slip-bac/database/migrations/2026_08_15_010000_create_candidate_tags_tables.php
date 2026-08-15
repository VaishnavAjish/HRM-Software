<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Wave 4 — Candidate CRM: managed candidate tags (a per-tenant taxonomy) and
 * the candidate↔tag pivot. The pivot is unique per (candidate, tag) so the
 * same tag can never be attached twice to a candidate.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_tags', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('color', 20)->default('#6366f1');
            $table->string('company_code')->nullable()->index();
            $table->string('unit')->nullable()->index();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['company_code', 'unit']);
        });

        Schema::create('candidate_candidate_tag', function (Blueprint $table) {
            $table->id();
            $table->foreignId('candidate_id')->constrained('candidates')->cascadeOnDelete();
            $table->foreignId('candidate_tag_id')->constrained('candidate_tags')->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['candidate_id', 'candidate_tag_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_candidate_tag');
        Schema::dropIfExists('candidate_tags');
    }
};