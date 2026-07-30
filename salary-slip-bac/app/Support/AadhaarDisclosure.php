<?php

namespace App\Support;

use App\Models\User;
use App\Services\Documents\DocumentAudit;

/**
 * The one place a complete Aadhaar is added to an API response.
 *
 * users.aadhar_card_no stays in User::$hidden, so no generic serialisation can
 * emit it. Every surface that is allowed to disclose it — self profile, employee
 * details, appointment details — comes through here, which keeps the
 * authorisation rule and the audit trail in a single place instead of repeated
 * per controller.
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
        $basis = AadhaarAccess::basisFor($actor, $target);

        if ($basis === null) {
            return $payload;
        }

        $digits = AadhaarReference::normalise(
            (string) ($target->getRawOriginal('aadhar_card_no') ?? '')
        );

        if (! AadhaarReference::isValid($digits)) {
            return $payload;
        }

        $payload['aadhaar_full'] = $digits;

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
            $basis === 'SELF' ? 'OWNERSHIP' : AadhaarAccess::PERMISSION,
            'ALLOWED'
        );

        return $payload;
    }
}
