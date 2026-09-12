<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            if (!Schema::hasColumn('candidates', 'onboarding_details')) {
                $table->json('onboarding_details')->nullable();
            }
            if (!Schema::hasColumn('candidates', 'onboarding_status')) {
                $table->string('onboarding_status')->default('NOT_STARTED');
            }
            if (!Schema::hasColumn('candidates', 'onboarding_initiated_at')) {
                $table->timestamp('onboarding_initiated_at')->nullable();
            }
            if (!Schema::hasColumn('candidates', 'onboarding_completed_at')) {
                $table->timestamp('onboarding_completed_at')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropColumn(array_filter(
                ['onboarding_details', 'onboarding_status', 'onboarding_initiated_at', 'onboarding_completed_at'],
                fn ($col) => Schema::hasColumn('candidates', $col)
            ));
        });
    }
};
