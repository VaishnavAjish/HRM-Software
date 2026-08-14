<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * job_families — groups of related jobs within a function (03.01).
 *
 * Example: Technology → Software Engineering, Data, Infrastructure, Cyber Security.
 * A Job Function may contain multiple Job Families.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('job_families')) {
            return;
        }

        Schema::create('job_families', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('job_function_id')->nullable();
            $table->string('code', 40)->unique();
            $table->string('name', 190);
            $table->text('description')->nullable();
            $table->string('status', 20)->default('active'); // active, inactive
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('job_function_id');
            $table->index('status');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('job_function_id')->references('id')->on('job_functions')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('job_families');
    }
};
