<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Models\Unit;
use App\Support\CompanyMembership;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * What backfilling user_units from users.unit would do — and nothing else.
 *
 * Writes nothing, by design. Company ownership of the legacy unit strings is not
 * derivable: the same name appears under both companies, and a row count is not
 * evidence. A wrong guess silently rescopes real employees, and company scope is
 * what decides who can see whose salary.
 *
 * The audit that produced this command also settled what `unit` means, which is
 * the thing a backfill has to know before it runs:
 *
 *   users.unit is the employee's HOME unit for every account on this database.
 *   It is read by attendance, payroll, imports, exports and every unit filter.
 *
 *   users.unit is ALSO the administered unit for a tier-2 unit administrator,
 *   where it becomes authorization scope through `where('unit', $actor->unit)`.
 *   There are currently zero tier-2 accounts, so that reading is dormant.
 *
 * Those are two different concepts sharing one column, distinguished by the
 * actor's role rather than by the data. The backfill therefore populates
 * user_units as employment membership and leaves users.unit alone — it stays
 * the home unit, and nothing about authorization changes.
 */
class ReportUnitNormalization extends Command
{
    protected $signature = 'units:report {--apply : Reserved. Refuses to run until ownership is confirmed.}';

    protected $description = 'Report what a user_units backfill would find. Writes nothing.';

    public function handle(): int
    {
        if ($this->option('apply')) {
            $this->error('Refusing to apply. Company ownership of the legacy unit names is unconfirmed;');
            $this->error('see the conflicts below. Resolve them, then a dedicated migration can run.');
            $this->newLine();
        }

        $rows = DB::table('users')
            ->selectRaw('company_code, unit, count(*) as total')
            ->whereNotNull('unit')
            ->where('unit', '!=', '')
            ->where('is_deleted', '0')
            ->groupBy('company_code', 'unit')
            ->orderBy('company_code')
            ->orderBy('unit')
            ->get();

        if ($rows->isEmpty()) {
            $this->info('No user carries a unit. There is nothing to normalise.');

            return self::SUCCESS;
        }

        $this->section('Legacy unit strings, as stored');
        $this->table(
            ['company_code', 'users.unit', 'Users'],
            $rows->map(fn ($row) => [$row->company_code, $row->unit, $row->total])->all()
        );

        $companies = Company::query()->pluck('id', 'code');
        $units = Unit::query()->get();

        $plan = [];
        $unmapped = [];

        foreach ($rows as $row) {
            foreach (CompanyMembership::parse($row->company_code) as $code) {
                $companyId = $companies[$code] ?? null;
                $unit = $units->first(
                    fn (Unit $candidate) => (int) $candidate->company_id === (int) $companyId
                        && $candidate->name === $row->unit
                );

                $key = $code . '|' . $row->unit;

                if ($unit === null) {
                    $unmapped[$key] = [
                        $row->unit,
                        $code,
                        $companyId === null ? 'company not recorded' : 'no unit record',
                        $row->total,
                    ];

                    continue;
                }

                $plan[$key] = [
                    $row->unit,
                    $code,
                    (string) $unit->id,
                    $row->total,
                    'membership + home unit',
                ];
            }
        }

        $this->section('Would link (unit record exists for that company)');

        if ($plan === []) {
            $this->line('  Nothing. No legacy string matches a unit inside its own company.');
        } else {
            $this->table(['Unit', 'Company', 'Unit id', 'Users', 'Writes'], array_values($plan));
        }

        $this->section('Would NOT link');

        if ($unmapped === []) {
            $this->line('  Nothing outstanding.');
        } else {
            $this->table(['Unit', 'Company', 'Reason', 'Users'], array_values($unmapped));
        }

        $this->reportDecisionTable($rows, $companies, $units);
        $this->reportAmbiguity($rows);
        $this->reportConflicts();

        $this->section('Gate');
        $this->line('  Dry run only — nothing was written.');
        $this->line('  Before an apply step may be built, all of the following must hold:');
        $this->line('    1. every legacy unit name has a confirmed owning company;');
        $this->line('    2. the conflicting users listed above are individually resolved;');
        $this->line('    3. multi-unit employment is confirmed as a real thing, or the pivot');
        $this->line('       carries exactly one row per user.');

        return self::SUCCESS;
    }

    /**
     * One row per COMPANY + UNIT pair, which is the only key that identifies a
     * unit.
     *
     * Not per unit name. The data already shows the same names under both
     * companies, so "which company does Daduk belong to" is the wrong question —
     * it presumes an answer the data contradicts. The right question is asked
     * once per pair: is this a real unit of this company, or is it bad legacy
     * data? Only a person who knows the business can answer, so every pair
     * without a unit record is left as CONFIRM.
     */
    private function reportDecisionTable($rows, $companies, $units): void
    {
        $pairs = [];

        foreach ($rows as $row) {
            foreach (CompanyMembership::parse($row->company_code) as $code) {
                $key = $code . '|' . $row->unit;
                $pairs[$key] = [
                    'unit' => $row->unit,
                    'company' => $code,
                    'users' => ($pairs[$key]['users'] ?? 0) + (int) $row->total,
                ];
            }
        }

        ksort($pairs);

        $table = [];

        foreach ($pairs as $pair) {
            $companyId = $companies[$pair['company']] ?? null;
            $unit = $units->first(
                fn ($candidate) => (int) $candidate->company_id === (int) $companyId
                    && $candidate->name === $pair['unit']
            );

            $table[] = [
                $pair['unit'],
                $pair['company'],
                $pair['users'],
                $unit ? 'YES (configured)' : 'CONFIRM',
                $unit ? (string) $unit->id : '—',
                $unit ? 'link users to this unit' : 'confirm valid, or mark as data error',
            ];
        }

        $this->section('Decision table — one row per COMPANY + UNIT pair');
        $this->line('  A unit is identified by its company AND its name. The same name exists');
        $this->line('  under both companies, so asking which single company owns "Daduk" would');
        $this->line('  presume an answer the data contradicts. Each pair is decided separately.');
        $this->newLine();

        $this->table(
            ['Unit', 'Company', 'Users', 'Valid unit here?', 'Canonical id', 'Action'],
            $table
        );
    }

    /** Names that appear under more than one company. */
    private function reportAmbiguity($rows): void
    {
        $byName = [];

        foreach ($rows as $row) {
            foreach (CompanyMembership::parse($row->company_code) as $code) {
                $byName[$row->unit][$code] = ($byName[$row->unit][$code] ?? 0) + (int) $row->total;
            }
        }

        $shared = array_filter($byName, static fn ($companies) => count($companies) > 1);

        if ($shared === []) {
            return;
        }

        $this->section('Ambiguous names');
        $this->line('  These appear under more than one company, so the name alone identifies');
        $this->line('  nothing and one units row per name would merge two different places.');

        foreach ($shared as $unit => $companies) {
            $parts = [];

            foreach ($companies as $code => $count) {
                $parts[] = "{$code} ({$count})";
            }

            $this->line(sprintf('    %-12s %s', $unit, implode(', ', $parts)));
        }
    }

    /**
     * Individual users whose unit does not belong to any company they are in.
     *
     * Named individually and never corrected. Each is one of: a data-entry
     * error, a genuine cross-company assignment, a historical transfer, or
     * evidence that the proposed mapping is wrong — and the four need different
     * answers, none of which this command is in a position to choose.
     */
    private function reportConflicts(): void
    {
        $units = Unit::query()->with('company')->get();

        if ($units->isEmpty()) {
            return;
        }

        $conflicts = [];

        foreach (DB::table('users')
            ->whereNotNull('unit')->where('unit', '!=', '')->where('is_deleted', '0')
            ->get(['id', 'emp_code', 'name', 'company_code', 'unit']) as $user) {
            $codes = CompanyMembership::parse($user->company_code);
            $named = $units->where('name', $user->unit);

            if ($named->isEmpty()) {
                continue;
            }

            $owners = $named->map(fn (Unit $unit) => $unit->company?->code)->filter()->all();

            if (array_intersect($codes, $owners) === []) {
                $conflicts[] = [
                    $user->id,
                    $user->emp_code,
                    $user->name,
                    $user->company_code,
                    $user->unit,
                    implode(', ', $owners),
                ];
            }
        }

        if ($conflicts === []) {
            return;
        }

        $this->section('Conflicts — resolve individually, do not auto-correct');
        $this->table(
            ['User id', 'Emp code', 'Name', 'Companies', 'users.unit', 'That unit belongs to'],
            $conflicts
        );
    }

    private function section(string $title): void
    {
        $this->newLine();
        $this->info($title);
        $this->line(str_repeat('-', min(78, strlen($title) + 4)));
    }
}
