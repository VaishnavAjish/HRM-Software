<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Data fix: hospitals are now a single shared directory, not scoped per
 * company (2026-09-22, at the user's explicit direction — see
 * `HospitalController`'s docblock). Any hospital row still carrying its old
 * per-company `company_code` is normalized to `all-companies` so every
 * employee, on every company, sees it — matching what every new hospital
 * is created with going forward.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_hospitals')) {
            return;
        }

        DB::table('mediclaim_hospitals')->update(['company_code' => 'all-companies']);
    }

    public function down(): void
    {
        // The original per-company company_code values aren't recoverable
        // (and the app no longer reads this column for scoping) —
        // intentionally a no-op.
    }
};
