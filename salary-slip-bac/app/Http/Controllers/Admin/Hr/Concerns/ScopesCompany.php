<?php

namespace App\Http\Controllers\Admin\Hr\Concerns;

use App\Support\CompanyMembership;
use Illuminate\Http\Request;

trait ScopesCompany
{
    protected function applyCompanyScope($query, Request $request)
    {
        $userAuth = auth('api')->user();
        $requested = CompanyMembership::parse($request->company_code);

        if ($this->hasGlobalCompanyScope($userAuth)) {
            if ($requested !== []) {
                $this->whereCompanyCodeMatches($query, $requested);
            }
        } else {
            $authorized = CompanyMembership::parse($userAuth?->company_code);
            $effective = $requested === []
                ? $authorized
                : array_values(array_intersect($requested, $authorized));

            if ($effective === []) {
                $query->whereRaw('1 = 0');
            } else {
                $this->whereCompanyCodeMatches($query, $effective);
            }

            if ($userAuth && (int) $userAuth->role === 2 && $userAuth->unit) {
                $query->where('unit', $userAuth->unit);
            }
        }

        if ($request->unit) {
            $query->where('unit', $request->unit);
        }

        return $query;
    }

    /**
     * Whether the acting user may see a record that belongs to the given
     * company code. For records that don't carry `company_code`/`unit`
     * columns themselves (e.g. an Interview or Offer scoped through its
     * Candidate), pass the owning record's company code through here rather
     * than re-deriving this check per controller.
     */
    protected function companyCodeWithinActorScope(?string $companyCode): bool
    {
        $actor = auth('api')->user();

        if ($this->hasGlobalCompanyScope($actor)) {
            return true;
        }

        $authorized = CompanyMembership::parse($actor?->company_code);
        $owning = CompanyMembership::parse($companyCode);

        return $owning !== [] && array_intersect($owning, $authorized) !== [];
    }

    protected function hasGlobalCompanyScope($userAuth): bool
    {
        if (! $userAuth) {
            return false;
        }

        if (in_array((int) $userAuth->role, [0, 1], true)) {
            return true;
        }

        $tokens = array_map('trim', explode(',', (string) $userAuth->company_code));

        return (bool) array_intersect(['all', 'all-companies'], $tokens);
    }

    protected function whereCompanyCodeMatches($query, array $codes)
    {
        return $query->where(function ($q) use ($codes) {
            foreach ($codes as $code) {
                if ($code === 'all' || $code === 'all-companies') {
                    $q->orWhereNotNull('company_code');
                } else {
                    $q->orWhere('company_code', $code)
                      ->orWhere('company_code', 'like', "%{$code}%");
                }
            }
        });
    }

    protected function defaultCompanyContext(Request $request): array
    {
        $userAuth = auth('api')->user();
        $companyCode = $request->company_code && !in_array($request->company_code, ['all', 'all-companies'])
            ? explode(',', $request->company_code)[0]
            : ($userAuth->company_code ?? null);

        return [
            'company_code' => $companyCode,
            'unit' => $request->unit ?? ($userAuth->unit ?? null),
        ];
    }
}
