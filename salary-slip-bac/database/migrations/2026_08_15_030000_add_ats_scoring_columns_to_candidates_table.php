<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            if (!Schema::hasColumn('candidates', 'ats_score_breakdown')) {
                $table->json('ats_score_breakdown')->nullable()->after('ats_score');
            }

            if (!Schema::hasColumn('candidates', 'ats_scored_at')) {
                $table->timestamp('ats_scored_at')->nullable()->after('ats_score_breakdown');
            }

            if (!Schema::hasColumn('candidates', 'ats_score_source')) {
                // 'system' = computed by the scoring engine, 'manual' = HR-entered
                // override. Lets the UI tell an operator "this is a real score"
                // apart from "someone typed a number in".
                $table->string('ats_score_source', 20)->nullable()->after('ats_scored_at');
            }
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropColumn(array_filter(
                ['ats_score_breakdown', 'ats_scored_at', 'ats_score_source'],
                fn ($col) => Schema::hasColumn('candidates', $col)
            ));
        });
    }
};
