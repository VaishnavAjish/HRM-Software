<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * job_levels — hierarchical job levels (03.01).
 *
 * Examples: L1, L2, L3, L4, L5, L6, etc.
 * Do not hard-code levels; make them configurable per enterprise.
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (Schema::hasTable('job_levels')) {
            return;
        }

        Schema::create('job_levels', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->string('code', 20)->unique();
            $table->string('name', 190);
            $table->unsignedInteger('rank')->default(0); // For ordering: L1=1, L2=2, etc.
            $table->text('description')->nullable();
            $table->string('career_stage', 40)->nullable(); // entry, junior, mid, senior, lead, principal, executive
            $table->string('status', 20)->default('active'); // active, inactive
            $table->date('effective_from')->nullable();
            $table->date('effective_to')->nullable();
            $table->timestamps();

            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('rank');
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
        Schema::dropIfExists('job_levels');
    }
};
