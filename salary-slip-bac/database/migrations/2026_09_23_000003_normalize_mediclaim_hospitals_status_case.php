<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Data fix: the admin Hospitals form was submitting `status` as
 * `"ACTIVE"`/`"INACTIVE"` (uppercase) instead of the documented
 * `MediclaimHospital::STATUSES` convention (`active`/`inactive`, lowercase).
 * A model mutator now normalizes every future write, but any hospital rows
 * already saved through the old form need a one-time lowercase pass so
 * every case-sensitive `where('status', 'active')` filter in the app (and
 * any future one) matches them correctly.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('mediclaim_hospitals')) {
            return;
        }

        DB::table('mediclaim_hospitals')->update([
            'status' => DB::raw('LOWER(TRIM(status))'),
        ]);
    }

    public function down(): void
    {
        // Case is not meaningfully reversible (and the app never relied on
        // any particular case before this fix) — intentionally a no-op.
    }
};
