<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class AuditPayrollUserLinks extends Command
{
    protected $signature = 'hrms:audit-payroll-user-links';

    protected $description = 'Report how cleanly salary_slips/attendances map to users.id by (company_code, emp_code). Read-only; counts only, no PII.';

    public function handle(): int
    {
        foreach (['salary_slips', 'attendances'] as $table) {
            $this->report($table);
        }

        return self::SUCCESS;
    }

    private function report(string $table): void
    {
        $rows = DB::table($table)->select('company_code', 'emp_code')->get();

        $total = $rows->count();
        $blankKey = 0;
        $unique = 0;
        $ambiguous = 0;
        $unmatched = 0;

        foreach ($rows as $row) {
            if (trim((string) $row->emp_code) === '') {
                $blankKey++;

                continue;
            }

            $matches = DB::table('users')
                ->where('is_deleted', 0)
                ->where('emp_code', $row->emp_code)
                ->where('company_code', $row->company_code)
                ->count();

            if ($matches === 1) {
                $unique++;
            } elseif ($matches === 0) {
                $unmatched++;
            } else {
                $ambiguous++;
            }
        }

        $this->info("-- {$table} --");
        $this->table(['metric', 'count'], [
            ['total rows', $total],
            ['blank emp_code', $blankKey],
            ['unique match (backfillable)', $unique],
            ['ambiguous (needs review)', $ambiguous],
            ['unmatched (orphan/needs review)', $unmatched],
        ]);
    }
}
