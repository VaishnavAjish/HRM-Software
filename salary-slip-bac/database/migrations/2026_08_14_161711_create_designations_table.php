<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * designations — formal job titles within the architecture (03.01).
 *
 * Distinct from Job: Designation is the formal title used in contracts, org charts, etc.
 * Links to Job Family, Function, Level, Grade.
 * Existing free-text designation on users table will be migrated to reference this master.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('designations')) {
            return;
        }

        Schema::create('designations', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('job_family_id')->nullable();
            $table->unsignedBigInteger('job_function_id')->nullable();
            $table->unsignedBigInteger('job_level_id')->nullable();
            $table->unsignedBigInteger('job_grade_id')->nullable();
            $table->string('code', 40)->unique();
            $table->string('title', 190);
            $table->text('description')->nullable();
            $table->string('status', 20)->default('active'); // active, inactive
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('job_family_id');
            $table->index('job_function_id');
            $table->index('job_level_id');
            $table->index('job_grade_id');
            $table->index('status');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('job_family_id')->references('id')->on('job_families')->nullOnDelete();
            $table->foreign('job_function_id')->references('id')->on('job_functions')->nullOnDelete();
            $table->foreign('job_level_id')->references('id')->on('job_levels')->nullOnDelete();
            $table->foreign('job_grade_id')->references('id')->on('job_grades')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('designations');
    }
};
