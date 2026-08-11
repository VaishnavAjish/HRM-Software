<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Which roles an administrator may hand out when creating an account directly.
 *
 * The roles table already answers "may this role be assigned at all"
 * (is_assignable), "is it a system identity" (is_system) and "is it dangerous"
 * (is_sensitive). None of those answer the question this adds: a role can be
 * perfectly assignable and still have no business being the starting identity of
 * an account typed into User Management, because accounts of that kind are
 * supposed to arrive through a form that captures the rest of the person.
 *
 * Employee is exactly that. An employee record comes from the Trial or
 * Appointment form, which carry the company, unit, documents and Aadhaar the
 * account needs; minting one from the six-field admin dialog produces a
 * half-populated employee that later has to be reconciled by hand.
 *
 * A flag rather than a hardcoded code list, because the whole point is that a
 * role created next year participates without a code change: mark it
 * direct-creatable or do not, and both the dropdown and the server agree.
 *
 * users.provisioning_source records which flow produced the row. Three
 * different endpoints can create the same employee and, until now, the record
 * did not say which one did — the difference matters when an account turns up
 * with no company or no canonical role and the question is which path skipped it.
 */
return new class extends Migration
{
    private const PROVISIONING_ONLY_CODES = ['employee', 'emp'];

    public function up(): void
    {
        if (Schema::hasTable('roles') && ! Schema::hasColumn('roles', 'is_direct_creatable')) {
            Schema::table('roles', function (Blueprint $table) {
                $table->boolean('is_direct_creatable')->default(true);
            });

            DB::table('roles')
                ->whereIn('code', self::PROVISIONING_ONLY_CODES)
                ->update(['is_direct_creatable' => false]);
        }

        if (Schema::hasTable('users') && ! Schema::hasColumn('users', 'provisioning_source')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('provisioning_source', 32)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('roles') && Schema::hasColumn('roles', 'is_direct_creatable')) {
            Schema::table('roles', function (Blueprint $table) {
                $table->dropColumn('is_direct_creatable');
            });
        }

        if (Schema::hasTable('users') && Schema::hasColumn('users', 'provisioning_source')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('provisioning_source');
            });
        }
    }
};
