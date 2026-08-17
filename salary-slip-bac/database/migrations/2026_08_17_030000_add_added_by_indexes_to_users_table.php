<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `users.added_by` (who created an agent-sourced candidate/trial-form/
 * appointment row) had no index at all, despite two hot list endpoints
 * filtering on it directly:
 *
 *   UserController::getAgentCandidates() — User::where('added_by', ...)
 *   UserController::getTrialForms()      — User::where('type','trial')->where('added_by', ...) for agents
 *
 * Both were full table scans on `users`, which also stores every employee,
 * candidate, trial form, and appointment row in the same table. Traced live
 * on production: a single `getTrialForms`/`getAgentCandidates` call blocking
 * for 70-90+ seconds — and because the production app server (`php artisan
 * serve`) handles one request at a time, that also blocked every other
 * request behind it, including unrelated logins, for the same duration.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->index('added_by', 'idx_users_added_by');
            $table->index(['type', 'added_by'], 'idx_users_type_added_by');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('idx_users_added_by');
            $table->dropIndex('idx_users_type_added_by');
        });
    }
};
