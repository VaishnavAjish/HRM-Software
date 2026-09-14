<?php

namespace App\Services\Mediclaim\Support;

/**
 * Formats a rupee amount using Indian digit grouping (lakh/crore — commas
 * every 2 digits after the first 3), e.g. 300000 -> "₹3,00,000", used by
 * both PDF templates (B6): the card's family floater limit (read from
 * `MediclaimPolicyVersion::rules['floater_limit_amount']`, never hardcoded)
 * and the claim-form's Section E/K amounts.
 */
class IndianCurrencyFormatter
{
    public static function format(int|float|string|null $amount): string
    {
        if ($amount === null || $amount === '') {
            return 'N/A';
        }

        $amount = (float) $amount;
        $negative = $amount < 0;
        $amount = abs($amount);

        $rupees = (string) (int) round($amount);
        $lastThree = substr($rupees, -3);
        $rest = substr($rupees, 0, -3);

        $grouped = $rest !== ''
            ? (preg_replace('/\B(?=(\d{2})+(?!\d))/', ',', $rest) . ',' . $lastThree)
            : $lastThree;

        // Literal UTF-8 rupee sign (U+20B9) — a single-quoted escape sequence
        // like '\u{20B9}' is NOT interpreted by PHP (that only works inside
        // double-quoted strings/heredocs), so the actual character is used
        // directly here rather than risk a silently-wrong literal.
        return ($negative ? '-' : '') . '₹' . $grouped;
    }
}
