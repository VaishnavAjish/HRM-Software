<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class BackfillPayrollUserIds extends Command
{
    protected $signature = 'hrms:backfill-payroll-user-ids {--apply : Write user_id for unambiguous rows (default is a dry run)}';

    protected $description = 'Backfill salary_slips/attendances.user_id from a unique (company_code, emp_code) match. Only unambiguous rows are written; ambiguous/unmatched rows are reported, never guessed.';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');

        foreach (['salary_slips', 'attendances'] as $table) {
            if (! Schema::hasColumn($table, 'user_id')) {
                $this->error("{$table}.user_id is missing — run the add_user_id migration first.");

                return self::FAILURE;
            }
        }

        foreach (['salary_slips', 'attendances'] as $table) {
            $this->process($table, $apply);
        }

        if (! $apply) {
            $this->newLine();
            $this->warn('Dry run only. Re-run with --apply to write the unambiguous matches.');
        }

        return self::SUCCESS;
    }

    private function process(string $table, bool $apply): void
    {
        $rows = DB::table($table)
            ->whereNull('user_id')
            ->select('id', 'company_code', 'emp_code')
            ->get();

        $would = 0;
        $ambiguous = 0;
        $unmatched = 0;
        $updates = [];

        foreach ($rows as $row) {
            if (trim((string) $row->emp_code) === '') {
                $unmatched++;

                continue;
            }

            $ids = DB::table('users')
                ->where('is_deleted', 0)
                ->where('emp_code', $row->emp_code)
                ->where('company_code', $row->company_code)
                ->pluck('id');

            if ($ids->count() === 1) {
                $would++;
                $updates[$row->id] = $ids->first();
            } elseif ($ids->count() === 0) {
                $unmatched++;
            } else {
                $ambiguous++;
            }
        }

        if ($apply && $updates) {
            DB::transaction(function () use ($table, $updates) {
                foreach ($updates as $rowId => $userId) {
                    DB::table($table)->where('id', $rowId)->update(['user_id' => $userId]);
                }
            });
        }

        $verb = $apply ? 'linked' : 'would link';
        $this->info("-- {$table} -- {$verb}: {$would}, ambiguous: {$ambiguous}, unmatched: {$unmatched}");
    }
}
