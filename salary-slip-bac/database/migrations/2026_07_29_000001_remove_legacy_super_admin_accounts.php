<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Removes the two legacy seeded super-admin accounts.
 *
 * Both shipped with shared, hardcoded passwords in DatabaseSeeder and carried
 * role = 0 (Super Admin), so anyone who had ever read the repo could sign in
 * with full privileges. They are dropped from the database here and from the
 * seeder, so `db:seed` will not recreate them.
 */
return new class extends Migration
{
    private const LEGACY_EMAILS = [
        'admin@superadmin.com',
        'devlopertest@gmail.com',
    ];

    public function up(): void
    {
        $ids = DB::table('users')
            ->whereIn('email', self::LEGACY_EMAILS)
            ->pluck('id');

        if ($ids->isEmpty()) {
            return;
        }

        // users.added_by is a plain unsignedBigInteger with no foreign key, so
        // nothing would clean it up automatically — null it out first to avoid
        // leaving rows pointing at ids that no longer exist. The real foreign
        // keys (user_roles, audit logs, upload batches, attendances) are
        // already declared cascadeOnDelete or nullOnDelete.
        DB::table('users')->whereIn('added_by', $ids)->update(['added_by' => null]);

        DB::table('users')->whereIn('id', $ids)->delete();
    }

    public function down(): void
    {
        // Intentionally irreversible. Recreating these accounts would restore
        // super-admin logins with publicly known passwords, which is exactly
        // what this migration exists to remove.
    }
};
