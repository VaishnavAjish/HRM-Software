<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_policy_hospitals — network membership: which hospitals a given
 * policy version treats as cashless/network. Plain pivot (no extra pivot
 * attributes), so it is queried via `belongsToMany` without a dedicated
 * pivot model, same convention as `candidate_candidate_tag`.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_policy_hospitals')) {
            Schema::create('mediclaim_policy_hospitals', function (Blueprint $table) {
                $table->id();
                $table->foreignId('policy_version_id')->constrained('mediclaim_policy_versions')->cascadeOnDelete();
                $table->foreignId('hospital_id')->constrained('mediclaim_hospitals')->cascadeOnDelete();
                $table->timestamps();

                $table->unique(['policy_version_id', 'hospital_id'], 'mc_policy_hospitals_unique');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_policy_hospitals');
    }
};
