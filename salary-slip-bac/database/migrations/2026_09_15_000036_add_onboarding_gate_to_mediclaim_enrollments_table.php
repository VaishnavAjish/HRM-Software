<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Gates a new employee's Mediclaim workspace down to "read the rule book,
 * then add family members" before the full tabbed workspace unlocks — see
 * `MyCoverageController::acknowledgeRuleBook()`/`completeOnboarding()` and
 * `EmployeeMediclaimWorkspace.jsx`'s gated rendering.
 *
 * Existing enrollments predate this gate and already have real usage
 * history (claims, cards, family members already added) — backfilling both
 * timestamps to `created_at` for every row that already exists avoids
 * retroactively locking an already-active employee out of the workspace
 * they were already using. Only enrollments created after this migration
 * (i.e. genuinely new employees) start ungated.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('mediclaim_enrollments') && ! Schema::hasColumn('mediclaim_enrollments', 'onboarding_completed_at')) {
            Schema::table('mediclaim_enrollments', function (Blueprint $table) {
                $table->timestamp('rule_book_acknowledged_at')->nullable()->after('status');
                $table->timestamp('onboarding_completed_at')->nullable()->after('rule_book_acknowledged_at');
            });

            DB::table('mediclaim_enrollments')->update([
                'rule_book_acknowledged_at' => DB::raw('created_at'),
                'onboarding_completed_at' => DB::raw('created_at'),
            ]);
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mediclaim_enrollments') && Schema::hasColumn('mediclaim_enrollments', 'onboarding_completed_at')) {
            Schema::table('mediclaim_enrollments', function (Blueprint $table) {
                $table->dropColumn(['rule_book_acknowledged_at', 'onboarding_completed_at']);
            });
        }
    }
};
