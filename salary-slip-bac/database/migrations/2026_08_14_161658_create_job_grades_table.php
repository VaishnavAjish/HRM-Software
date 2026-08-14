<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * job_grades — compensation grades linked to job levels (03.01).
 *
 * Links to salary ranges, currency, eligibility rules.
 * Integrates with Payroll, Compensation, Promotion, Benefits, Workforce Planning.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('job_grades')) {
            return;
        }

        Schema::create('job_grades', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->unsignedBigInteger('job_level_id')->nullable();
            $table->string('code', 20)->unique();
            $table->string('name', 190);
            $table->text('description')->nullable();
            $table->string('currency', 3)->default('INR');
            $table->decimal('min_salary', 15, 2)->nullable();
            $table->decimal('mid_salary', 15, 2)->nullable();
            $table->decimal('max_salary', 15, 2)->nullable();
            $table->json('eligibility_rules')->nullable(); // JSON rules for grade eligibility
            $table->string('status', 20)->default('active'); // active, inactive
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('job_level_id');
            $table->index('status');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('job_level_id')->references('id')->on('job_levels')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('job_grades');
    }
};
