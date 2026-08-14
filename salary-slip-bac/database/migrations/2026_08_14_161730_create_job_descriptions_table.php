<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * job_descriptions — versioned structured job descriptions (03.01).
 *
 * Never overwrite historical job descriptions used by past employees or recruitment campaigns.
 * Each version is immutable once created.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('job_descriptions')) {
            return;
        }

        Schema::create('job_descriptions', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('job_id');
            $table->unsignedInteger('version')->default(1);
            $table->text('summary')->nullable();
            $table->text('purpose')->nullable();
            $table->text('responsibilities')->nullable(); // Detailed responsibilities
            $table->text('qualifications')->nullable();
            $table->text('skills')->nullable();
            $table->text('competencies')->nullable();
            $table->text('experience')->nullable();
            $table->text('education')->nullable();
            $table->text('work_conditions')->nullable();
            $table->text('travel_requirements')->nullable();
            $table->text('risk')->nullable();
            $table->boolean('remote_eligible')->default(false);
            $table->string('remote_eligibility_type', 20)->nullable(); // eligible, not_eligible, conditional
            $table->json('remote_conditions')->nullable();
            $table->string('status', 20)->default('draft'); // draft, published, archived
            $table->unsignedBigInteger('created_by')->nullable();
            $table->unsignedBigInteger('approved_by')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->unique(['job_id', 'version']);
            $table->index('job_id');
            $table->index('status');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('job_id')->references('id')->on('jobs')->cascadeOnDelete();
            $table->foreign('created_by')->references('id')->on('users')->nullOnDelete();
            $table->foreign('approved_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('job_descriptions');
    }
};
