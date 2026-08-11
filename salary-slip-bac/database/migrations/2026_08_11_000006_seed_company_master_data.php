<?php

use Database\Seeders\UnitDefinitionSeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The two companies this product runs on, as records.
 *
 * Creating the companies table did not populate it, and nothing else did either
 * — the rows on the primary database were inserted by hand. On any other
 * deployment that leaves `companies` empty, and an empty companies table is not
 * a cosmetic gap: the New User form requires at least one company, so account
 * creation is impossible until somebody notices and adds them.
 *
 * The codes are not invented here. They are exactly the tokens already stored in
 * users.company_code, which is what makes a membership serialisable back into
 * that column without a translation table.
 *
 * Idempotent on both counts, so the database that already has these rows is
 * untouched and the unit definitions land wherever they are missing.
 */
return new class extends Migration
{
    private const COMPANIES = [
        ['code' => 'nidhi-impex', 'name' => 'Nidhi Impex'],
        ['code' => 'silver-star', 'name' => 'Silver Star'],
    ];

    public function up(): void
    {
        if (! Schema::hasTable('companies')) {
            return;
        }

        foreach (self::COMPANIES as $company) {
            // updateOrInsert on the code alone: a deployment that has renamed a
            // company keeps its name, because the name is editable master data
            // and the code is the identity.
            if (DB::table('companies')->where('code', $company['code'])->exists()) {
                continue;
            }

            DB::table('companies')->insert($company + [
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        (new UnitDefinitionSeeder())->run();
    }

    /**
     * Deliberately not reversed.
     *
     * Rolling back must not delete companies that users, units and
     * users.company_code all point at — that would strand every account whose
     * tenant these rows describe. Dropping the tables is what the create
     * migrations' own down() steps are for.
     */
    public function down(): void
    {
    }
};
