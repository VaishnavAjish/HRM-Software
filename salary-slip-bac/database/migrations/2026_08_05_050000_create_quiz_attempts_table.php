<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // A quiz was previously only attachable to a requisition. Interviews
        // need their own quiz, plus a per-quiz time limit and a violation
        // threshold the proctored runner enforces.
        Schema::table('training_quizzes', function (Blueprint $table) {
            $table->foreignId('interview_id')->nullable()->after('requisition_id')
                ->constrained('interviews')->nullOnDelete();
            $table->unsignedInteger('duration_minutes')->default(30)->after('passing_score');
            $table->unsignedInteger('max_violations')->default(3)->after('duration_minutes');
            $table->boolean('is_active')->default(true)->after('max_violations');
        });

        Schema::create('quiz_attempts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('quiz_id')->constrained('training_quizzes')->cascadeOnDelete();
            $table->foreignId('candidate_id')->constrained('candidates')->cascadeOnDelete();
            $table->foreignId('interview_id')->nullable()->constrained('interviews')->nullOnDelete();

            // Candidates are not users and have no login, so the only way they
            // can reach their own quiz is an unguessable per-attempt token.
            $table->string('access_token', 64)->unique();

            // pending -> in_progress -> submitted | terminated | expired
            $table->string('status')->default('pending');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('link_expires_at')->nullable();
            $table->unsignedInteger('duration_minutes')->default(30);

            // Scoring is always recomputed server-side from `answers`; the
            // client never sends a score.
            $table->json('answers')->nullable();
            $table->unsignedInteger('total_questions')->default(0);
            $table->unsignedInteger('correct_count')->default(0);
            $table->unsignedInteger('score')->default(0); // percentage 0-100
            $table->boolean('passed')->default(false);

            // Proctoring trail: every tab switch / focus loss / fullscreen exit
            // is posted as it happens, so the record survives the candidate
            // closing the tab mid-attempt.
            $table->unsignedInteger('violation_count')->default(0);
            $table->json('proctor_events')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();

            $table->string('company_code')->nullable();
            $table->string('unit')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['candidate_id', 'status']);
            $table->index('quiz_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quiz_attempts');

        Schema::table('training_quizzes', function (Blueprint $table) {
            $table->dropConstrainedForeignId('interview_id');
            $table->dropColumn(['duration_minutes', 'max_violations', 'is_active']);
        });
    }
};
