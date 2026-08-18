<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Mirrors document_audit_logs' shape (see DocumentAudit) — same actor/
 *  request/IP columns, scrubbed metadata, never a raw token. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('assessment_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quiz_attempt_id')->nullable()->constrained('quiz_attempts')->nullOnDelete();
            $table->foreignId('candidate_id')->nullable()->constrained('candidates')->nullOnDelete();
            $table->foreignId('quiz_id')->nullable()->constrained('training_quizzes')->nullOnDelete();
            $table->string('company_code')->nullable();
            $table->foreignId('actor_user_id')->nullable()->constrained('users')->nullOnDelete();

            $table->string('action');
            $table->string('ip_address')->nullable();
            $table->string('user_agent', 512)->nullable();
            $table->string('request_id')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['quiz_attempt_id']);
            $table->index(['candidate_id']);
            $table->index(['actor_user_id']);
            $table->index(['action']);
            $table->index(['created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('assessment_audit_logs');
    }
};
