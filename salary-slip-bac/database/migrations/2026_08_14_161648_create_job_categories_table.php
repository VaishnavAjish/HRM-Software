<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * job_categories — categorical classification of jobs (03.01).
 *
 * Examples: Management, Professional, Technical, Operational, Administrative, Support, Executive.
 * Configurable per enterprise.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('job_categories')) {
            return;
        }

        Schema::create('job_categories', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->string('code', 40)->unique();
            $table->string('name', 190);
            $table->text('description')->nullable();
            $table->string('status', 20)->default('active'); // active, inactive
            $table->unsignedInteger('sort_order')->default(0);
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('status');
            $table->index(['effective_from', 'effective_to']);

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('job_categories');
    }
};
