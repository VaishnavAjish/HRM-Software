<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * job_evaluations — configurable job evaluation records (03.01).
 *
 * Supports configurable factors: Responsibility, Complexity, Skills, Decision Making, Leadership, Impact, Experience, Risk.
 * Provides evaluation form, score, evaluator, review date, history, result.
 * Does not build compensation decisions directly unless explicitly configured.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('job_evaluations')) {
            return;
        }

        Schema::create('job_evaluations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('job_id');
            $table->unsignedBigInteger('evaluator_id')->nullable();
            $table->json('factor_scores')->nullable(); // { responsibility: 5, complexity: 4, skills: 5, decision_making: 4, leadership: 3, impact: 4, experience: 3, risk: 2 }
            $table->decimal('total_score', 5, 2)->nullable();
            $table->string('result', 40)->nullable(); // e.g., grade_recommendation, level_recommendation
            $table->text('notes')->nullable();
            $table->date('review_date')->nullable();
            $table->string('status', 20)->default('draft'); // draft, submitted, approved, rejected
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('job_id');
            $table->index('evaluator_id');
            $table->index('status');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('job_id')->references('id')->on('jobs')->cascadeOnDelete();
            $table->foreign('evaluator_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('approved_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('job_evaluations');
    }
};
