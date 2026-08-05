<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Allocates the next ticket number, e.g. TKT-2026-000145.
 *
 * Business rule 1 is that every ticket has a unique number, and the obvious
 * implementation — max(ticket_number) + 1 — cannot deliver it. Two employees
 * submitting in the same instant both read the same maximum, both build the same
 * string, and the unique index rejects one of them: a 500 on a correctly filled
 * form, appearing only under the load where it is hardest to reproduce.
 *
 * Instead a single counter row per year is locked with SELECT ... FOR UPDATE, so
 * a concurrent caller blocks on the lock and then reads the already-incremented
 * value. The lock is held for one statement inside the caller's transaction.
 */
class TicketNumber
{
    private const PREFIX = 'TKT';

    private const PAD = 6;

    /**
     * Must run inside a transaction — the row lock is released when it commits.
     * Callers already open one to write the ticket and its first activity row
     * together, so the number is never burned by a later failure.
     */
    public static function next(?int $year = null): string
    {
        $year = $year ?: (int) date('Y');
        $periodKey = (string) $year;

        // Create-then-lock rather than lockForUpdate on a possibly absent row:
        // FOR UPDATE locks nothing when it matches nothing, so two callers could
        // both insert the first row of a new year. insertOrIgnore leans on the
        // unique index to settle that race without raising.
        DB::table('ticket_number_counters')->insertOrIgnore([
            'period_key' => $periodKey,
            'current_value' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $row = DB::table('ticket_number_counters')
            ->where('period_key', $periodKey)
            ->lockForUpdate()
            ->first();

        $next = (int) ($row->current_value ?? 0) + 1;

        DB::table('ticket_number_counters')
            ->where('period_key', $periodKey)
            ->update(['current_value' => $next, 'updated_at' => now()]);

        return sprintf('%s-%s-%s', self::PREFIX, $periodKey, str_pad((string) $next, self::PAD, '0', STR_PAD_LEFT));
    }
}
