<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('performance_reviews', function (Blueprint $table) {
            $table->id();
            $table->foreignId('cycle_id')->constrained('performance_cycles')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('reviewer_id')->constrained('users')->cascadeOnDelete();
            $table->string('review_type'); // self | manager | peer | 360
            $table->decimal('overall_rating', 2, 1)->nullable(); // 1.0 - 5.0
            $table->decimal('potential_rating', 2, 1)->nullable(); // manager-only, feeds the 9-box grid
            $table->json('competency_ratings')->nullable(); // { competency: rating } — feeds skill/competency matrix
            $table->text('strengths')->nullable();
            $table->text('improvements')->nullable();
            $table->string('status')->default('draft'); // draft | submitted | acknowledged
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('acknowledged_at')->nullable();
            $table->timestamps();

            $table->unique(['cycle_id', 'user_id', 'reviewer_id', 'review_type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('performance_reviews');
    }
};
