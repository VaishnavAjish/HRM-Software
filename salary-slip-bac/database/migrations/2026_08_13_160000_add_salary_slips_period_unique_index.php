<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Backs the "one salary slip per employee per month" rule with a real database
 * constraint. Until now uniqueness lived only in AdminController's
 * updateOrCreate() — a check-then-act that two concurrent uploads both pass,
 * producing duplicate slips and double-counted dashboard totals.
 *
 * Self-checking: a UNIQUE index cannot be created while duplicates exist, so
 * this migration aborts with a clear message (rather than half-applying) if any
 * are present. Resolve the duplicates and re-run.
 */
return new class extends Migration
{
    private string $indexName = 'salary_slips_company_emp_period_unique';

    public function up(): void
    {
        if (! Schema::hasTable('salary_slips')) {
            return;
        }

        $duplicateGroups = DB::table('salary_slips')
            ->select('company_code', 'emp_code', 'month', 'year', DB::raw('COUNT(*) as c'))
            ->groupBy('company_code', 'emp_code', 'month', 'year')
            ->havingRaw('COUNT(*) > 1')
            ->get();

        if ($duplicateGroups->isNotEmpty()) {
            throw new RuntimeException(
                'Cannot add the salary_slips period unique index: '
                . $duplicateGroups->count()
                . ' duplicate (company_code, emp_code, month, year) group(s) exist. '
                . 'Resolve the duplicate slips, then re-run this migration.'
            );
        }

        Schema::table('salary_slips', function (Blueprint $table) {
            $table->unique(['company_code', 'emp_code', 'month', 'year'], $this->indexName);
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('salary_slips')) {
            return;
        }

        Schema::table('salary_slips', function (Blueprint $table) {
            $table->dropUnique($this->indexName);
        });
    }
};
