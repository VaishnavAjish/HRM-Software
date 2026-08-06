<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Assessment -> Interview -> Offer workflow adds a "Reject" action that
 * requires a reason. `candidate_stage_history.notes` already captures free
 * text per transition, but a dedicated column lets the UI show/require the
 * reason without parsing history rows, and survives even if history is ever
 * pruned.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->string('rejection_reason')->nullable()->after('notes');
        });
    }

    public function down(): void
    {
        Schema::table('candidates', function (Blueprint $table) {
            $table->dropColumn('rejection_reason');
        });
    }
};
