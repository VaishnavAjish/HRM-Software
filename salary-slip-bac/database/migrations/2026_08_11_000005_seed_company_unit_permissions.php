<?php

use Database\Seeders\CompanyUnitPermissionSeeder;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Permission codes for Access Control → Company & Unit.
 *
 * A migration rather than a seeder invocation, because ProductionSafetyServiceProvider
 * blocks `db:seed` outright and every deployment runs `migrate`. Without this the
 * page would exist, its routes would be registered, and nobody — not even the
 * super administrator — would hold the codes those routes require, so it would
 * answer 403 on a system where it is supposed to work by default.
 *
 * The seeder is idempotent and guards its own preconditions, so a database whose
 * roles are created afterwards simply gets the permissions without the grants;
 * running the seeder again once roles exist fills them in.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        (new CompanyUnitPermissionSeeder())->run();
    }

    public function down(): void
    {
        if (! Schema::hasTable('permissions')) {
            return;
        }

        $ids = DB::table('permissions')->whereIn('code', CompanyUnitPermissionSeeder::CODES)->pluck('id');

        if ($ids->isEmpty()) {
            return;
        }

        if (Schema::hasTable('role_permissions')) {
            DB::table('role_permissions')->whereIn('permission_id', $ids)->delete();
        }

        DB::table('permissions')->whereIn('id', $ids)->delete();
    }
};
