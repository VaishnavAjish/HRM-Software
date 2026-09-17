<?php

namespace App\Support;

use Illuminate\Support\Carbon;

/**
 * The Indian financial year (April 1 – March 31) a date falls in. Shared by
 * `PolicyEligibilityService::floaterUsage()` (the floater renews on this
 * exact boundary) and `MyClaimController::index()`'s `financial_year` list
 * filter ("My Claims"'s FY-wise view) — one implementation instead of the
 * date math being duplicated between them and drifting apart.
 */
class MediclaimFinancialYear
{
    /** The April 1 (start of day) that begins the financial year containing `$asOf`. */
    public static function start(Carbon $asOf): Carbon
    {
        $year = $asOf->month >= 4 ? $asOf->year : $asOf->year - 1;

        return Carbon::create($year, 4, 1)->startOfDay();
    }

    /** The March 31 (end of day) that ends the financial year containing `$asOf`. */
    public static function end(Carbon $asOf): Carbon
    {
        return static::start($asOf)->copy()->addYear()->subDay()->endOfDay();
    }

    /**
     * [start, end] Carbon bounds for the FY identified by its starting
     * calendar year — e.g. `boundsForStartYear(2026)` is FY 2026-27
     * (1 Apr 2026 – 31 Mar 2027), matching `label()`'s naming.
     *
     * @return array{0: Carbon, 1: Carbon}
     */
    public static function boundsForStartYear(int $startYear): array
    {
        $start = Carbon::create($startYear, 4, 1)->startOfDay();

        return [$start, $start->copy()->addYear()->subDay()->endOfDay()];
    }

    /** "2026-27" label for the financial year containing `$asOf`. */
    public static function label(Carbon $asOf): string
    {
        $start = static::start($asOf);

        return $start->format('Y') . '-' . $start->copy()->addYear()->format('y');
    }
}
