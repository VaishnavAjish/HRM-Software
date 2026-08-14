<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * jobs — the core job master (03.01).
 *
 * Defines "what work is this?" — distinct from Position which defines "where does a seat exist?"
 * Links to Job Family, Function, Category, Level, Grade, Designation.
 * Supports Job Codes (auto-gen + manual), multiple titles, effective dating.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('jobs')) {
            return;
        }

        Schema::create('jobs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('job_family_id')->nullable();
            $table->unsignedBigInteger('job_function_id')->nullable();
            $table->unsignedBigInteger('job_category_id')->nullable();
            $table->unsignedBigInteger('job_level_id')->nullable();
            $table->unsignedBigInteger('job_grade_id')->nullable();
            $table->unsignedBigInteger('designation_id')->nullable();
            $table->string('code', 60)->unique(); // e.g., ENG-SWE-001
            $table->string('formal_title', 190);
            $table->string('display_title', 190)->nullable();
            $table->string('internal_title', 190)->nullable();
            $table->string('external_title', 190)->nullable();
            $table->json('localized_titles')->nullable(); // { "en": "...", "hi": "..." }
            $table->text('summary')->nullable();
            $table->text('purpose')->nullable();
            $table->string('status', 20)->default('draft'); // draft, active, inactive, archived
            $table->string('employment_type', 40)->nullable(); // full_time, part_time, contract, intern, etc.
            $table->boolean('is_remote_eligible')->default(false);
            $table->string('remote_eligibility_type', 20)->nullable(); // eligible, not_eligible, conditional
            $table->json('remote_conditions')->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('job_family_id');
            $table->index('job_function_id');
            $table->index('job_category_id');
            $table->index('job_level_id');
            $table->index('job_grade_id');
            $table->index('designation_id');
            $table->index('code');
            $table->index('status');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('job_family_id')->references('id')->on('job_families')->nullOnDelete();
            $table->foreign('job_function_id')->references('id')->on('job_functions')->nullOnDelete();
            $table->foreign('job_category_id')->references('id')->on('job_categories')->nullOnDelete();
            $table->foreign('job_level_id')->references('id')->on('job_levels')->nullOnDelete();
            $table->foreign('job_grade_id')->references('id')->on('job_grades')->nullOnDelete();
            $table->foreign('designation_id')->references('id')->on('designations')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('jobs');
    }
};
