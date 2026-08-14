<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * job_classifications — compliance and regulatory classifications (03.01).
 *
 * Supports: Job Class, Worker Class, Employee Group, Job Type, Occupational Category, Compliance Classification.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('job_classifications')) {
            return;
        }

        Schema::create('job_classifications', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('job_id');
            $table->string('job_class', 100)->nullable(); // e.g., exempt, non_exempt
            $table->string('worker_class', 100)->nullable(); // e.g., employee, contractor, consultant
            $table->string('employee_group', 100)->nullable(); // e.g., permanent, temporary, fixed_term
            $table->string('job_type', 100)->nullable(); // e.g., full_time, part_time, seasonal
            $table->string('occupational_category', 100)->nullable(); // e.g., per O*NET, ISCO
            $table->string('compliance_classification', 100)->nullable(); // e.g., FLSA, EEO, OFCCP
            $table->json('additional_classifications')->nullable(); // Extensible for local regulations
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->unique('job_id');
            $table->index('job_class');
            $table->index('worker_class');
            $table->index('employee_group');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('job_id')->references('id')->on('jobs')->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('job_classifications');
    }
};
