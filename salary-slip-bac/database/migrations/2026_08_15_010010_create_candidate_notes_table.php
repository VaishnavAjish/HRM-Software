<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Wave 4 — Candidate CRM: the recruiter note trail. Every entry is authored
 * and time-stamped so a candidate's CRM history is auditable. These are private
 * recruiter notes — never returned by any candidate-facing endpoint (see the
 * CONTRACT note in CandidateCrmController).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('candidate_notes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('candidate_id')->constrained('candidates')->cascadeOnDelete();
            $table->text('note');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['candidate_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('candidate_notes');
    }
};