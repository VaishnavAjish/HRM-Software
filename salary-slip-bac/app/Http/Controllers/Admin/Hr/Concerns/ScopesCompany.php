<?php

namespace App\Http\Controllers\Admin\Hr\Concerns;

use Illuminate\Http\Request;

/**
 * Mirrors the company/unit scoping branches in AdminController::dashboard()
 * so every HR endpoint filters multi-company/multi-unit data the same way
 * the rest of the admin API already does.
 */
trait ScopesCompany
{
    protected function applyCompanyScope($query, Request $request)
    {
        $userAuth = auth('api')->user();
        if ($userAuth && ((int) $userAuth->role === 1 || (int) $userAuth->role === 0)) {
            if ($request->company_code && !in_array($request->company_code, ['all', 'all-companies'])) {
                $codes = array_filter(array_map('trim', explode(',', $request->company_code)));
                $query->whereIn('company_code', $codes);
            }
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            if (!in_array('all', $codes) && !in_array('all-companies', $codes)) {
                $query->whereIn('company_code', $codes);
            }
        }
        if ($request->unit) {
            $query->where('unit', $request->unit);
        }

        return $query;
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
