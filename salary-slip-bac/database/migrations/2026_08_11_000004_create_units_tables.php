<?php

use Database\Seeders\UnitDefinitionSeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Units as records, owned by a company.
 *
 * users.unit is free text, and the only list of units anywhere is a constant in
 * the frontend's company config. That is enough to render a dropdown and not
 * enough to validate one: "show only units belonging to the selected companies"
 * is unanswerable without units.company_id, so a checkbox list built on the
 * string would filter in the browser and accept anything from the API.
 *
 * Two deliberate limits.
 *
 * Existing users are NOT backfilled. Their unit strings do not agree with the
 * config's mapping — one silver-star account carries "Shreeji", which the config
 * calls a Nidhi unit — so the mapping is an assertion, not confirmed business
 * data, and inferring ownership from it would move real employees into a company
 * scope nobody chose. `php artisan units:report` shows the conflicts. Backfill
 * is a separate migration, after the business confirms ownership.
 *
 * users.unit stays load-bearing. Ten queries scope on `where('unit', ...)` as an
 * exact match, so it continues to hold exactly one unit name — the primary — and
 * user_units carries the full membership. Moving scoping onto the pivot is its
 * own change with its own cache and matcher work.
 *
 * "Ichapur" exists under both companies. That is why the unique key is
 * (company_id, code) and not code alone: they are two places that share a name.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('companies')) {
            return;
        }

        if (! Schema::hasTable('units')) {
            Schema::create('units', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('company_id');
                $table->string('code', 64);
                $table->string('name', 190);
                $table->boolean('is_active')->default(true);
                $table->timestamps();

                $table->unique(['company_id', 'code']);
                $table->index('company_id');

                $table->foreign('company_id')->references('id')->on('companies')->cascadeOnDelete();
            });
        }

        if (! Schema::hasTable('user_units')) {
            Schema::create('user_units', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('user_id');
                $table->unsignedBigInteger('unit_id');
                $table->timestamps();

                $table->unique(['user_id', 'unit_id']);
                $table->index('unit_id');

                $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();
                $table->foreign('unit_id')->references('id')->on('units')->cascadeOnDelete();
            });
        }

        // Definitions live in a seeder, not here: a migration can only seed rows
        // whose companies already exist, and an install that creates companies
        // afterwards would silently end up with an empty units table. Calling it
        // from both places, idempotently, covers either order.
        (new UnitDefinitionSeeder())->run();
    }

    public function down(): void
    {
        Schema::dropIfExists('user_units');
        Schema::dropIfExists('units');
    }
};
