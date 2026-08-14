<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * job_requirements — structured requirements for jobs (03.01).
 *
 * Supports: Education, Experience, Skill, Certification, Competency, Language, Travel, Security Clearance.
 * Each requirement can be: mandatory, preferred, minimum, maximum.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('job_requirements')) {
            return;
        }

        Schema::create('job_requirements', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('job_id');
            $table->string('type', 40); // education, experience, skill, certification, competency, language, travel, security_clearance
            $table->string('requirement', 500); // The actual requirement description
            $table->string('category', 40)->nullable(); // mandatory, preferred, minimum, maximum
            $table->json('details')->nullable(); // Structured details per type
            // Education: { qualification, degree, field, min_level, preferred_level, institution }
            // Experience: { min_years, max_years, relevant, industry, functional }
            // Skill: { skill, proficiency, mandatory, years, certification_link }
            // Certification: { certification, authority, mandatory, expiry, renewal, verification }
            // Competency: { competency, level, behavioral, functional, leadership, technical }
            // Language: { language, speaking, reading, writing, listening, proficiency }
            // Travel: { type, percentage, domestic, international }
            // Security Clearance: { type, required, level, expiry, verification }
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('job_id');
            $table->index('type');
            $table->index('category');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('job_id')->references('id')->on('jobs')->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('job_requirements');
    }
};
