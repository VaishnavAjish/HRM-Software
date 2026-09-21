<?php

namespace App\Support;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Allocates the next Mediclaim claim number.
 *
 * Requirements:
 * - Company NIDHI IMPEX and Branch SHREEJI: NS-{EMP_CODE}-{YYYY-MM-DD}
 * - Company NIDHI IMPEX and Branch ICHAPUR: NI-{EMP_CODE}-{YYYY-MM-DD}
 * - Company SILVER STAR and Branch DADUK:   SD-{EMP_CODE}-{YYYY-MM-DD}
 * - Company SILVER STAR and Branch ICHAPUR: SI-{EMP_CODE}-{YYYY-MM-DD}
 * Date format is strictly YYYY-MM-DD.
 *
 * If duplicate claims are created for the same employee on the same date,
 * a sequence counter suffix (-2, -3) is appended to maintain unique index integrity.
 */
class MediclaimClaimNumber
{
    private const LEGACY_PREFIX = 'MC';
    private const LEGACY_PAD = 6;

    /**
     * Resolves the prefix based on company name/code and unit/branch.
     */
    public static function resolvePrefix(?string $company, ?string $branch): string
    {
        $comp = strtolower(trim((string) $company));
        $br = strtolower(trim((string) $branch));

        $isNidhi = str_contains($comp, 'nidhi');
        $isSilver = str_contains($comp, 'silver');

        $isShreeji = str_contains($br, 'shreeji');
        $isIchapur = str_contains($br, 'ichapur') || str_contains($br, 'ichhapore');
        $isDaduk = str_contains($br, 'daduk') || str_contains($br, 'dhaduk');

        if ($isNidhi && $isShreeji) {
            return 'NS';
        }
        if ($isNidhi && $isIchapur) {
            return 'NI';
        }
        if ($isSilver && $isDaduk) {
            return 'SD';
        }
        if ($isSilver && $isIchapur) {
            return 'SI';
        }

        // Fallbacks if matching partially
        if ($isNidhi) {
            return $isDaduk ? 'ND' : 'NS';
        }
        if ($isSilver) {
            return $isShreeji ? 'SS' : 'SD';
        }

        $cInitial = !empty($comp) ? strtoupper(substr(preg_replace('/[^a-zA-Z]/', '', $comp), 0, 1)) : 'M';
        $bInitial = !empty($br) ? strtoupper(substr(preg_replace('/[^a-zA-Z]/', '', $br), 0, 1)) : 'C';

        return ($cInitial ?: 'M') . ($bInitial ?: 'C');
    }

    /**
     * Allocates next claim number.
     * When employee context is provided (User or employee array), generates:
     *   {PREFIX}-{EMP_CODE}-{YYYY-MM-DD}
     * Otherwise falls back to legacy atomic company+year counter.
     */
    public static function next(string $companyCode, mixed $employeeOrYear = null, ?string $date = null, ?string $branch = null): string
    {
        // If employee context is passed, format according to the new company/branch specification
        if ($employeeOrYear instanceof User || (is_array($employeeOrYear) && (isset($employeeOrYear['emp_code']) || isset($employeeOrYear['unit']) || isset($employeeOrYear['branch'])))) {
            $empCode = '0001';
            $userBranch = $branch;
            $company = $companyCode;

            if ($employeeOrYear instanceof User) {
                $empCode = trim((string) ($employeeOrYear->emp_code ?: $employeeOrYear->id));
                $userBranch = $userBranch ?: ($employeeOrYear->unit ?: $employeeOrYear->branch);
                $company = $companyCode ?: $employeeOrYear->company_code;

                if (! $userBranch && $employeeOrYear->id) {
                    $dbUser = User::find($employeeOrYear->id);
                    $userBranch = $dbUser?->unit ?: $dbUser?->branch;
                    if (! $company) {
                        $company = $dbUser?->company_code;
                    }
                }
            } elseif (is_array($employeeOrYear)) {
                $empCode = trim((string) ($employeeOrYear['emp_code'] ?? $employeeOrYear['id'] ?? '0001'));
                $userBranch = $userBranch ?: ($employeeOrYear['unit'] ?? $employeeOrYear['branch'] ?? null);
                $company = $companyCode ?: ($employeeOrYear['company_code'] ?? null);
            }

            $prefix = self::resolvePrefix($company, $userBranch);
            $dateStr = $date ?: now()->format('Y-m-d');

            $base = sprintf('%s-%s-%s', $prefix, $empCode, $dateStr);

            $claimNumber = $base;
            $counter = 1;
            while (DB::table('mediclaim_claims')->where('claim_number', $claimNumber)->exists()) {
                $counter++;
                $claimNumber = sprintf('%s-%d', $base, $counter);
            }

            return $claimNumber;
        }

        // Legacy counter fallback when called without employee context (e.g. older tests or tools)
        $year = is_numeric($employeeOrYear) ? (int) $employeeOrYear : (int) date('Y');
        $company = strtoupper($companyCode);
        $periodKey = sprintf('%s:%s', $company, $year);

        DB::table('mediclaim_claim_number_counters')->insertOrIgnore([
            'period_key' => $periodKey,
            'current_value' => 0,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $row = DB::table('mediclaim_claim_number_counters')
            ->where('period_key', $periodKey)
            ->lockForUpdate()
            ->first();

        $next = (int) ($row->current_value ?? 0) + 1;

        DB::table('mediclaim_claim_number_counters')
            ->where('period_key', $periodKey)
            ->update(['current_value' => $next, 'updated_at' => now()]);

        return sprintf('%s-%s-%s-%s', self::LEGACY_PREFIX, $company, $year, str_pad((string) $next, self::LEGACY_PAD, '0', STR_PAD_LEFT));
    }
}
