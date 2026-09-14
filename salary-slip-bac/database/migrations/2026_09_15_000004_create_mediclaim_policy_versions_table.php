<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_policy_versions — effective-dated, versioned Mediclaim rules
 * (floater limit, max covered children, age limits, exclusions, network
 * requirement) as JSON. PolicyEligibilityService reads every numeric rule
 * from here, never hardcoded, and resolves the version as-of an explicit
 * date so a later version can never retroactively change an already-decided
 * claim's outcome.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_policy_versions')) {
            Schema::create('mediclaim_policy_versions', function (Blueprint $table) {
                $table->id();
                $table->foreignId('policy_id')->constrained('mediclaim_policies')->cascadeOnDelete();
                $table->unsignedInteger('version_number');
                $table->string('status')->default('draft'); // draft, active, expired, archived
                $table->json('rules');
                $table->date('effective_from')->nullable();
                $table->date('effective_to')->nullable();
                $table->timestamp('published_at')->nullable();
                $table->foreignId('published_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->unique(['policy_id', 'version_number'], 'mc_policy_versions_policy_version_unique');
                $table->index(['policy_id', 'effective_from', 'effective_to'], 'mc_policy_versions_effective_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_policy_versions');
    }
};
