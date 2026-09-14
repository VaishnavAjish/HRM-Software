<?php

namespace App\Services\Mediclaim;

use App\Services\Provisioning\ProvisioningException;

/**
 * A Mediclaim workflow rule refused the request outside the plain
 * ValidationException (422 "illegal transition") shape ClaimWorkflowService
 * otherwise throws.
 *
 * Same contract as ProvisioningException/OrganizationException — errorCode +
 * message + HTTP status — which is the established house convention for a
 * service raising a non-422 domain error (see e.g.
 * OrganizationUnitService::class throwing `new OrganizationException(...,
 * 409)` directly, and DocumentException::accessDenied() returning 403). A
 * future B4 controller's `guarded()` helper (the same one every
 * Admin\Organization\* and Workforce\* controller already uses to catch
 * ProvisioningException) will render this in the standard V1 error envelope
 * unchanged, with no new exception-handling wiring required.
 *
 * Used for the two Mediclaim cases that are not "this transition isn't legal
 * from the claim's current status" (422):
 *  - 403 when an actor who is authenticated but not the party a claim is
 *    actually assigned to (e.g. a manager other than the one snapshotted on
 *    the claim) attempts a resource-scoped decision on it.
 *  - 409 when a manager attempts a decision before the mandatory
 *    confidentiality acknowledgement is on record for their assignment.
 */
class MediclaimException extends ProvisioningException
{
    public static function forbidden(string $errorCode, string $message): self
    {
        return new self($errorCode, $message, 403);
    }

    public static function conflict(string $errorCode, string $message): self
    {
        return new self($errorCode, $message, 409);
    }
}
