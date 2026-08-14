<?php

namespace App\Services\Organization;

use App\Services\Provisioning\ProvisioningException;

/**
 * A DOMAIN 02 organization rule refused the request.
 *
 * Same contract as ProvisioningException — errorCode + message + HTTP status —
 * so the controllers' `guarded()` helper (which catches ProvisioningException)
 * renders it in the V1 envelope unchanged. It is a distinct class so services
 * can throw it without pretending the provisioning module owns every master-data
 * rule.
 */
class OrganizationException extends ProvisioningException
{
}
