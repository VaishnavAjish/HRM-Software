<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Employee reset/verification looks up `unit` with an exact-match WHERE
 * clause (AuthController::findEmployeeForReset), while the frontend always
 * sends the canonically-cased label from companyConfig.js ("Shreeji",
 * "Ichapur", "Daduk"). A batch of employees — imported with a differently
 * cased unit in the source spreadsheet — never matches that lookup, so
 * "Verify Employee" reports them not found even though the record exists.
 *
 * This normalises any case-variant of a known unit to its canonical form.
 * Idempotent: rows already correctly cased are left untouched.
 */
return new class extends Migration
{
    private const CANONICAL_UNITS = ['Shreeji', 'Ichapur', 'Daduk'];

    public function up(): void
    {
        foreach (self::CANONICAL_UNITS as $canonical) {
            DB::table('users')
                ->whereRaw('LOWER(unit) = ?', [strtolower($canonical)])
                ->where('unit', '!=', $canonical)
                ->update(['unit' => $canonical]);
        }
    }

    public function down(): void
    {
        // Casing cleanup only — nothing meaningful to revert to.
    }
};
