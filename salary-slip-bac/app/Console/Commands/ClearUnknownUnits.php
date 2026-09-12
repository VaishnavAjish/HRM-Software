<?php

namespace App\Console\Commands;

use App\Services\Authorization\SchemaSupport;
use Database\Seeders\UnitDefinitionSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Blanks out `unit` values that are not ANY company's real unit name —
 * "IT", "aaa", "AI Engineer" and similar leaked into users.unit/candidates.unit
 * through un-validated Excel imports (see UserController::isKnownUnit()).
 *
 * Deliberately narrower than a full backfill: it never guesses which company a
 * legitimate-looking unit name (e.g. "Shreeji" on a silver-star account)
 * belongs to — see ReportUnitNormalization's doc comment for why that guess is
 * unsafe. It only clears values that don't match ANY of the four real unit
 * names at all, which needs no company-ownership guess to be correct.
 *
 * Writes nothing unless --apply is passed.
 */
class ClearUnknownUnits extends Command
{
    protected $signature = 'units:clear-unknown {--apply : Actually blank the matched rows. Without this flag, only reports what would change.}';

    protected $description = 'Blank out unit values that are not a real unit name for any company (dry-run by default).';

    public function handle(): int
    {
        $validNames = [];
        if (SchemaSupport::hasTable('units')) {
            $rows = DB::table('units');
            if (SchemaSupport::hasColumn('units', 'is_active')) {
                $rows->where('is_active', true);
            }
            $validNames = $rows->pluck('name')->map(fn ($n) => strtolower(trim($n)))->unique()->values()->all();
        }

        if (empty($validNames)) {
            foreach (UnitDefinitionSeeder::DEFINITIONS as $names) {
                foreach ($names as $n) {
                    $validNames[] = strtolower(trim($n));
                }
            }
            $validNames = array_values(array_unique($validNames));
        }

        $this->info('Treating these as the only real unit names: ' . implode(', ', $validNames));
        $this->newLine();

        $apply = (bool) $this->option('apply');
        $totalCleared = 0;

        foreach (['users', 'candidates'] as $table) {
            if (! SchemaSupport::hasTable($table) || ! SchemaSupport::hasColumn($table, 'unit')) {
                continue;
            }

            $query = DB::table($table)->whereNotNull('unit')->where('unit', '!=', '');
            if ($table === 'users' && SchemaSupport::hasColumn('users', 'is_deleted')) {
                $query->where('is_deleted', '0');
            }

            $rows = $query->select('id', 'unit')->get()
                ->filter(fn ($row) => ! in_array(strtolower(trim($row->unit)), $validNames, true));

            if ($rows->isEmpty()) {
                $this->info("{$table}: nothing to clear.");
                continue;
            }

            $this->section("{$table}: " . $rows->count() . ' row(s) with an unrecognized unit value');
            $this->table(
                ['id', 'unit (will be cleared)'],
                $rows->map(fn ($r) => [$r->id, $r->unit])->all()
            );

            if ($apply) {
                DB::table($table)->whereIn('id', $rows->pluck('id'))->update(['unit' => null]);
                $this->info("Cleared " . $rows->count() . " row(s) in {$table}.");
            }

            $totalCleared += $rows->count();
        }

        $this->newLine();
        if (! $apply) {
            $this->warn("Dry run — nothing was changed. Re-run with --apply to clear these {$totalCleared} row(s).");
        } else {
            $this->info("Done. Cleared {$totalCleared} row(s) total.");
        }

        return self::SUCCESS;
    }
}
