<?php

namespace App\Console\Commands;

use App\Support\CompanyMembership;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Populate user_companies from the legacy company_code column.
 *
 * Deterministic: every token in the CSV is a company code, and the tokens are
 * exactly what the existing parsers already split on. Nothing is inferred, and
 * an unrecognised token is reported rather than turned into a new company —
 * inventing a company row from a typo would give it real membership.
 *
 * This writes only the pivot. users.company_code is left exactly as it is, so
 * authorization behaviour is unchanged whether this has run or not.
 *
 * Reports by default; --apply commits. Safe to rerun.
 */
class BackfillUserCompanies extends Command
{
    protected $signature = 'users:backfill-companies
                            {--apply : Write the memberships. Without this the command only reports.}';

    protected $description = 'Populate user_companies from the legacy company_code column.';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $companies = DB::table('companies')->pluck('id', 'code');

        if ($companies->isEmpty()) {
            $this->error('No companies seeded. Run the company seeder first.');

            return self::FAILURE;
        }

        $created = 0;
        $existing = 0;
        $blank = 0;
        $single = 0;
        $multi = 0;
        $unknown = [];
        $rows = [];

        foreach (DB::table('users')->select('id', 'company_code')->cursor() as $user) {
            $codes = CompanyMembership::parse($user->company_code);

            if ($codes === []) {
                $blank++;
                continue;
            }

            count($codes) > 1 ? $multi++ : $single++;

            foreach ($codes as $code) {
                $companyId = $companies[$code] ?? null;

                if ($companyId === null) {
                    $unknown[$code] = ($unknown[$code] ?? 0) + 1;
                    continue;
                }

                $held = DB::table('user_companies')
                    ->where('user_id', $user->id)
                    ->where('company_id', $companyId)
                    ->exists();

                if ($held) {
                    $existing++;
                    continue;
                }

                $created++;

                if ($apply) {
                    $rows[] = [
                        'user_id' => $user->id,
                        'company_id' => $companyId,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ];
                }
            }
        }

        if ($apply && $rows !== []) {
            foreach (array_chunk($rows, 500) as $chunk) {
                DB::table('user_companies')->insertOrIgnore($chunk);
            }
        }

        $this->newLine();
        $this->line($apply ? 'Applied.' : 'Dry run — nothing was written. Re-run with --apply to commit.');
        $this->table(['Outcome', 'Count'], [
            [$apply ? 'memberships created' : 'memberships would be created', $created],
            ['memberships already present', $existing],
            ['single-company users', $single],
            ['multi-company users', $multi],
            ['users with blank company_code', $blank],
            ['unrecognised company codes', array_sum($unknown)],
        ]);

        foreach ($unknown as $code => $count) {
            $this->warn("Unrecognised company code '{$code}' on {$count} user(s) — no company row exists for it.");
        }

        return self::SUCCESS;
    }
}
