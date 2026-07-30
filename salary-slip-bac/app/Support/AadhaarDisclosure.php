<?php

namespace App\Support;

use App\Models\User;
use App\Services\Documents\DocumentAudit;

/**
 * The one place a complete Aadhaar is added to an API response.
 *
 * users.aadhar_card_no stays in User::$hidden, so no generic serialisation can
 * emit it. Every surface allowed to disclose it — self profile, employee details,
 * employee list, appointment details, appointment list — comes through here, which
 * keeps the authorisation rule and the audit trail in one place instead of
 * repeated per controller.
 */
class AadhaarDisclosure
{
    /**
     * Add `aadhaar_full` to $payload when $actor may see $target's number.
     *
     * Audits once per call — which is once per HTTP request, since controllers
     * call this while building a response. A re-render on the client cannot
     * produce another entry because it never reaches the server.
     */
    public static function attach(array $payload, User $target, ?User $actor, string $action): array
    {
        $digits = self::fullFor($target, $actor);

        if ($digits === null) {
            return $payload;
        }

        $payload['aadhaar_full'] = $digits;

        $basis = AadhaarAccess::basisFor($actor, $target);

        DocumentAudit::record(
            $action,
            null,
            null,
            [
                'target_user_id' => $target->id,
                'organization_code' => $target->company_code,
                'basis' => $basis,
                // Last four only. The trail records the access, never the value.
                'aadhaar_last4' => substr($digits, -4),
            ],
            $basis === 'SELF' ? 'OWNERSHIP' : 'RECORD_ACCESS',
            'ALLOWED'
        );

        return $payload;
    }

    /**
     * The complete number if $actor may see it, else null. Records nothing.
     *
     * Used by list endpoints, which disclose many records in one request and are
     * audited once for the whole request rather than once per row — see
     * auditListDisclosure. A row-level entry would turn a single 500-row page view
     * into 500 audit inserts, which buries the trail it is supposed to provide and
     * makes the list slow enough that somebody removes the auditing altogether.
     */
    public static function fullFor(User $target, ?User $actor): ?string
    {
        if (! AadhaarAccess::allowsFor($actor, $target)) {
            return null;
        }

        $digits = AadhaarReference::normalise(
            (string) ($target->getRawOriginal('aadhar_card_no') ?? '')
        );

        return AadhaarReference::isValid($digits) ? $digits : null;
    }

    /**
     * One entry for a list request that disclosed $count complete numbers.
     *
     * Records how many and in which scope, never which values. Bulk disclosure is
     * the shape most worth being able to spot after the fact — one person opening
     * one record is routine, one request returning nine hundred is not.
     */
    public static function auditListDisclosure(?User $actor, int $count, string $action, array $context = []): void
    {
        if ($count < 1) {
            return;
        }

        DocumentAudit::record(
            $action,
            null,
            null,
            $context + [
                'disclosed_count' => $count,
                'basis' => 'RECORD_ACCESS',
                'organization_code' => $actor?->company_code,
            ],
            'RECORD_ACCESS',
            'ALLOWED'
        );
    }
}
