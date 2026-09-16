<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Concerns;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use Illuminate\Http\Request;

/**
 * `ScopesCompany::applyCompanyScope()` plus one addition: a row explicitly
 * created while the admin had "Both Companies" selected in the top-nav
 * company switcher is stored with `company_code = 'all-companies'` — a
 * literal string on the row, not something `ScopesCompany` treats
 * specially on the *read* side (it only special-cases "all"/"all-companies"
 * as the *requester's own* scope, via `hasGlobalCompanyScope()`). Without
 * this, a record HR intentionally made company-wide silently disappears for
 * every ordinary user, who is scoped to their own single company and whose
 * `whereCompanyCodeMatches()` check never matches the literal string
 * "all-companies" or "all". A truly global-scope actor already sees every
 * row with no filter applied at all in that case, so this extra allowance
 * is skipped for them to avoid narrowing their view.
 *
 * Composes `ScopesCompany` itself, so a consumer only needs this one trait
 * to get both `applyCompanyScope()` (unchanged, for strict admin-write
 * scoping) and `applyCompanyOrAllCompaniesScope()` (for reads that should
 * also surface company-wide rows).
 */
trait ScopesCompanyOrAllCompanies
{
    use ScopesCompany;

    protected function applyCompanyOrAllCompaniesScope($query, Request $request): void
    {
        $actor = auth('api')->user();

        if ($this->hasGlobalCompanyScope($actor)) {
            $this->applyCompanyScope($query, $request);

            return;
        }

        $query->where(function ($scoped) use ($request) {
            $this->applyCompanyScope($scoped, $request);
            $scoped->orWhere('company_code', 'all-companies')->orWhere('company_code', 'all');
        });
    }
}
