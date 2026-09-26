<?php

namespace App\Http\Controllers\Admin\Concerns;

use App\Models\User;

/**
 * Shared employee-code resolution for the attendance module. Punching code
 * first -- eSSL biometric devices only ever report a punching_no, never the
 * HR emp_code, so an employee's own emp_code/id can't be allowed to outrank
 * it when keying attendance rows (see AttendanceController::effectiveCode()'s
 * original docblock for the bug this fixed). Shared here so
 * AttendanceController and AttendanceCodeMapController can't drift apart.
 */
trait ResolvesEmployeeByCode
{
    private function effectiveCode(User $u): string
    {
        return (string) ($u->punching_no ?: $u->emp_code ?: $u->form_no ?: $u->id);
    }

    /**
     * Resolve an employee by whatever code a frontend/import row sent --
     * punching_no, emp_code, form_no or raw id, exact then zero-trimmed.
     * A strict emp_code-only match misses anyone identified by punching_no.
     */
    private function findEmployeeByCode(string $code, string $companyCode)
    {
        $trimmed = ltrim($code, '0');
        $candidates = array_unique(array_filter([$code, $trimmed]));

        return User::where('is_deleted', 0)
            ->when($companyCode && !in_array($companyCode, ['all', 'all-companies']), fn ($q) => $q->where('company_code', $companyCode))
            ->where(function ($q) use ($candidates, $code) {
                $q->whereIn('punching_no', $candidates)
                    ->orWhereIn('emp_code', $candidates)
                    ->orWhereIn('form_no', $candidates);
                if (is_numeric($code)) {
                    $q->orWhere('id', (int) $code);
                }
            })
            ->first();
    }
}
