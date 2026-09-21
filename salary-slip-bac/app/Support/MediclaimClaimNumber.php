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
 *
 * Rule: First alphabet of company + First alphabet of unit (from View Employees / users table).
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
     * Selects first alphabet of company and first alphabet of unit.
     */
    public static function resolvePrefix(?string $company, ?string $branch): string
    {
        $comp = strtolower(trim((string) $company));
        $br = strtolower(trim((string) $branch));

        $isNidhi = str_contains($comp, 'nidhi') || str_starts_with($comp, 'n');
        $isSilver = str_contains($comp, 'silver') || str_starts_with($comp, 's');

        $isShreeji = str_contains($br, 'shreeji') || str_starts_with($br, 's');
        $isIchapur = str_contains($br, 'ichapur') || str_contains($br, 'ichhapore') || str_contains($br, 'ichhapor') || str_starts_with($br, 'i');
        $isDaduk = str_contains($br, 'daduk') || str_contains($br, 'dhaduk') || str_starts_with($br, 'd');

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

        // Generic rule: first alphabet of company + first alphabet of unit
        $cClean = preg_replace('/[^a-zA-Z]/', '', $comp);
        $cInitial = $isNidhi ? 'N' : ($isSilver ? 'S' : (!empty($cClean) ? strtoupper(substr($cClean, 0, 1)) : 'M'));

        $bClean = preg_replace('/[^a-zA-Z]/', '', $br);
        $bInitial = '';
        if ($isShreeji) {
            $bInitial = 'S';
        } elseif ($isIchapur) {
            $bInitial = 'I';
        } elseif ($isDaduk) {
            $bInitial = 'D';
        } elseif (!empty($bClean)) {
            $bInitial = strtoupper(substr($bClean, 0, 1));
        } else {
            // Default unit if not set: Shreeji (S) for Nidhi, Daduk (D) for Silver Star
            $bInitial = ($cInitial === 'N') ? 'S' : (($cInitial === 'S') ? 'D' : 'C');
        }

        return $cInitial . $bInitial;
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
        if ($employeeOrYear instanceof User || (is_array($employeeOrYear) && (isset($employeeOrYear['emp_code']) || isset($employeeOrYear['unit']) || isset($employeeOrYear['branch']) || isset($employeeOrYear['id'])))) {
            $empCode = '0001';
            $userBranch = $branch;
            $company = $companyCode;
            $userId = null;

            if ($employeeOrYear instanceof User) {
                $userId = $employeeOrYear->id;
                $empCode = trim((string) ($employeeOrYear->emp_code ?: $employeeOrYear->id));
                $userBranch = $userBranch ?: ($employeeOrYear->unit ?: $employeeOrYear->branch);
                $company = $companyCode ?: $employeeOrYear->company_code;
            } elseif (is_array($employeeOrYear)) {
                $userId = $employeeOrYear['id'] ?? null;
                $empCode = trim((string) ($employeeOrYear['emp_code'] ?? $employeeOrYear['id'] ?? '0001'));
                $userBranch = $userBranch ?: ($employeeOrYear['unit'] ?? $employeeOrYear['branch'] ?? null);
                $company = $companyCode ?: ($employeeOrYear['company_code'] ?? null);
            }

            if ((! $userBranch || ! $company) && $userId) {
                $dbUser = DB::table('users')->where('id', $userId)->first();
                if ($dbUser) {
                    $userBranch = $userBranch ?: ($dbUser->unit ?: $dbUser->branch);
                    $company = $company ?: $dbUser->company_code;
                }
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
