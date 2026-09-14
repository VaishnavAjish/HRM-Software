<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_policies — top-level Mediclaim policy per company. Rules that
 * actually govern eligibility (floater cap, child/age limits, exclusions)
 * live on the versioned `mediclaim_policy_versions.rules` JSON, never here.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_policies')) {
            Schema::create('mediclaim_policies', function (Blueprint $table) {
                $table->id();
                $table->string('company_code');
                $table->string('policy_code')->unique();
                $table->string('name');
                $table->string('insurer_name')->nullable();
                $table->string('status')->default('draft'); // draft, active, inactive, archived
                $table->text('description')->nullable();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['company_code', 'status'], 'mc_policies_company_status_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_policies');
    }
};
