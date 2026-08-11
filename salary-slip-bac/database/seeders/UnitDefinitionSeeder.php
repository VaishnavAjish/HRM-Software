<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * The units each company owns — definitions only.
 *
 * These are the same names the product already offers in its unit dropdown, so
 * recording them makes no new claim; it moves an existing pick-list out of a
 * frontend constant into a table a foreign key can enforce.
 *
 * What this deliberately does NOT do is assign anybody to one. Which company owns
 * each legacy unit string is unconfirmed — `php artisan units:report` shows a
 * silver-star account carrying "Shreeji", which the frontend config calls a Nidhi
 * unit — and a wrong guess there silently rescopes real employees. Backfill is a
 * separate step, after the business confirms ownership.
 *
 * Separate from the migration because a migration can only seed rows whose
 * companies already exist, and a fresh install creates companies afterwards.
 * Idempotent, so running it again costs nothing.
 */
class UnitDefinitionSeeder extends Seeder
{
    public const DEFINITIONS = [
        'nidhi-impex' => ['Shreeji', 'Ichapur'],
        'silver-star' => ['Daduk', 'Ichapur'],
    ];

    public function run(): void
    {
        /*
         * Schema::hasTable, not SchemaSupport::hasTable.
         *
         * The latter memoises per process for the authorization stack's benefit,
         * and this runs from inside a migration that has just created the table
         * — so a probe taken earlier in the same `artisan migrate` caches "no"
         * and the seeder silently does nothing. That is precisely how a fresh
         * install ended up with an empty units table.
         */
        if (! Schema::hasTable('units') || ! Schema::hasTable('companies')) {
            return;
        }

        foreach (self::DEFINITIONS as $companyCode => $units) {
            $companyId = DB::table('companies')->where('code', $companyCode)->value('id');

            if (! $companyId) {
                continue;
            }

            foreach ($units as $name) {
                DB::table('units')->updateOrInsert(
                    ['company_id' => $companyId, 'code' => Str::slug($name)],
                    ['name' => $name, 'is_active' => true, 'created_at' => now(), 'updated_at' => now()]
                );
            }
        }
    }
}
