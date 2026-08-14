<?php

namespace App\Services\Organization\Concerns;

use App\Models\Company;
use App\Models\User;
use App\Services\Organization\OrganizationException;
use App\Support\CompanyMembership;

/**
 * The tenancy gate every DOMAIN 02 service applies to a claimed company.
 *
 * A route-level `permission:` gate decides WHO may call these endpoints; it does
 * not decide WHICH company a caller may touch. Tenant master data is
 * meaningless without its tenant, so every read that names a company and every
 * write that stores one must pass through assertCompanyVisible(): super admins
 * (and holders of the `all`/`all-companies` sentinel) may touch any company,
 * everyone else only the companies their own company_code contains.
 */
trait VerifiesCompanyAccess
{
    /** @return list<string> */
    protected function authorizedCompanyCodes(?User $actor): array
    {
        if ($actor === null) {
            return [];
        }

        $raw = (int) $actor->role;

        if (in_array($raw, [0, 1], true)) {
            return ['_global_'];
        }

        $tokens = CompanyMembership::parse((string) $actor->company_code);

        if (array_intersect($tokens, ['all', 'all-companies']) !== []) {
            return ['_global_'];
        }

        return $tokens;
    }

    protected function assertCompanyVisible(Company $company, ?User $actor): void
    {
        $codes = $this->authorizedCompanyCodes($actor);

        if (in_array('_global_', $codes, true)) {
            return;
        }

        if (! in_array($company->code, $codes, true)) {
            throw new OrganizationException(
                'COMPANY_FORBIDDEN',
                'You do not have access to company "'.$company->name.'".',
                403
            );
        }
    }

    /** True when the actor may see every company (not just their own). */
    protected function hasGlobalCompanyScope(?User $actor): bool
    {
        return in_array('_global_', $this->authorizedCompanyCodes($actor), true);
    }
}