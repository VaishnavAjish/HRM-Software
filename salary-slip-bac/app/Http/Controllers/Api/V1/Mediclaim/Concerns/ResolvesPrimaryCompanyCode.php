<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Concerns;

use App\Models\User;

/**
 * `users.company_code` may hold a comma-separated list (multi-company staff).
 * Exact clone of `ClaimWorkflowService::primaryCompanyCode()` (private there),
 * needed here too for self-service writes (e.g. `IntimationController@store`)
 * that must allocate a company-scoped reference number before any
 * `MediclaimClaim` exists yet for the employee to borrow a company code from.
 */
trait ResolvesPrimaryCompanyCode
{
    protected function primaryCompanyCode(User $user): string
    {
        $first = trim(explode(',', (string) $user->company_code)[0] ?? '');

        return $first !== '' ? $first : (string) $user->company_code;
    }
}
