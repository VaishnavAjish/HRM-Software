<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Replaces the unique index on aadhaar_secure_reference with a plain index.
 *
 * Historical data legitimately contains repeated Aadhaar numbers (the backfill
 * found 9 records across 2 numbers), and a unique constraint blocked those rows
 * from being backfilled at all — which in turn blocked document uploads for
 * them. Collisions are now prevented by putting the appointment id in the
 * object key rather than by forbidding duplicate data.
 *
 * Uniqueness of Aadhaar across appointments is a business rule to be validated
 * separately, not enforced silently by a storage index.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique('users_aadhaar_secure_reference_unique');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->index('aadhaar_secure_reference', 'users_aadhaar_secure_reference_index');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_aadhaar_secure_reference_index');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->unique('aadhaar_secure_reference', 'users_aadhaar_secure_reference_unique');
        });
    }
};
