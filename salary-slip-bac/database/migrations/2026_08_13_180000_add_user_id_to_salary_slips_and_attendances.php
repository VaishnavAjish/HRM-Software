<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $duplicates = DB::table('users')
            ->select('company_code', 'emp_code')
            ->whereNotNull('emp_code')
            ->where('emp_code', '!=', '')
            ->groupBy('company_code', 'emp_code')
            ->havingRaw('count(*) > 1')
            ->count();

        if ($duplicates > 0) {
            throw new RuntimeException(
                "Cannot add unique (company_code, emp_code) index: {$duplicates} duplicate group(s) exist. Clean them up first."
            );
        }

        foreach (['salary_slips', 'attendances'] as $table) {
            Schema::table($table, function (Blueprint $blueprint) {
                $blueprint->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                $blueprint->index('user_id');
            });

            $this->backfill($table);
        }

        DB::statement(
            "CREATE UNIQUE INDEX users_company_emp_code_unique ON users (company_code, emp_code) WHERE emp_code IS NOT NULL AND emp_code <> ''"
        );
        DB::statement('CREATE INDEX users_emp_code_index ON users (emp_code)');
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS users_company_emp_code_unique');
        DB::statement('DROP INDEX IF EXISTS users_emp_code_index');

        foreach (['salary_slips', 'attendances'] as $table) {
            Schema::table($table, function (Blueprint $blueprint) use ($table) {
                $blueprint->dropForeign([$table === 'salary_slips' ? 'user_id' : 'user_id']);
                $blueprint->dropIndex([$table . '_user_id_index']);
                $blueprint->dropColumn('user_id');
            });
        }
    }

    private function backfill(string $table): void
    {
        $users = DB::table('users')
            ->select('id', 'emp_code', 'company_code')
            ->whereNotNull('emp_code')
            ->where('emp_code', '!=', '')
            ->get();

        $byEmpCode = [];
        foreach ($users as $user) {
            $companies = array_filter(array_map('trim', explode(',', (string) $user->company_code)));
            $byEmpCode[$user->emp_code][] = ['id' => $user->id, 'companies' => $companies];
        }

        $pairs = DB::table($table)
            ->select('company_code', 'emp_code')
            ->whereNull('user_id')
            ->distinct()
            ->get();

        $linked = 0;
        $orphaned = [];

        foreach ($pairs as $pair) {
            $matches = [];
            foreach ($byEmpCode[$pair->emp_code] ?? [] as $candidate) {
                if (in_array((string) $pair->company_code, $candidate['companies'], true)) {
                    $matches[] = $candidate['id'];
                }
            }

            if (count($matches) === 1) {
                $linked += DB::table($table)
                    ->where('company_code', $pair->company_code)
                    ->where('emp_code', $pair->emp_code)
                    ->update(['user_id' => $matches[0]]);
            } else {
                $orphaned[] = "{$pair->company_code}/{$pair->emp_code}(" . count($matches) . ' matches)';
            }
        }

        Log::info("user_id backfill on {$table}: {$linked} rows linked, " . count($orphaned) . ' unmatched pairs', [
            'unmatched' => array_slice($orphaned, 0, 50),
        ]);
    }
};
