<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * job_responsibilities — structured responsibilities linked to jobs (03.01).
 *
 * Multiple responsibilities per job with priority, percentage, competency, KPI/KRA linkage.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('job_responsibilities')) {
            return;
        }

        Schema::create('job_responsibilities', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('job_id');
            $table->text('responsibility');
            $table->unsignedInteger('priority')->default(0); // 1 = highest
            $table->decimal('percentage', 5, 2)->nullable(); // % of job time
            $table->unsignedBigInteger('competency_id')->nullable(); // Link to competency framework
            $table->string('kpi_linkage', 190)->nullable();
            $table->string('kra_linkage', 190)->nullable();
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('job_id');
            $table->index('priority');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('job_id')->references('id')->on('jobs')->cascadeOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('job_responsibilities');
    }
};
