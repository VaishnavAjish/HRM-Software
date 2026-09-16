<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Two additive gaps found while wiring up the employee-facing hospital
 * directory:
 *
 * - `mediclaim_hospitals` had no coordinates at all, so "Directions" could
 *   only ever geocode a free-text address string — adding nullable
 *   `latitude`/`longitude` lets the admin pin the exact location once, which
 *   the directory then uses for both an embedded map and a precise
 *   directions link, falling back to the address string when unset.
 * - `mediclaim_hospital_contacts` had no `name` (only `designation`, e.g.
 *   "Mediclaim Coordinator") and no `photo` — there was no way to record
 *   who the contact actually is, only their role. `designation` is relaxed
 *   to nullable at the same time since a plain named contact with no
 *   assigned role is now a valid, common case (no existing rows are
 *   affected — contacts were seeded empty, "HR enters those" post-launch,
 *   per `HospitalDirectory.jsx`'s docblock).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('mediclaim_hospitals') && ! Schema::hasColumn('mediclaim_hospitals', 'latitude')) {
            Schema::table('mediclaim_hospitals', function (Blueprint $table) {
                $table->decimal('latitude', 10, 7)->nullable()->after('pincode');
                $table->decimal('longitude', 10, 7)->nullable()->after('latitude');
            });
        }

        if (Schema::hasTable('mediclaim_hospital_contacts') && ! Schema::hasColumn('mediclaim_hospital_contacts', 'name')) {
            Schema::table('mediclaim_hospital_contacts', function (Blueprint $table) {
                $table->string('name')->nullable()->after('hospital_id');
                $table->string('photo')->nullable()->after('email');
            });
        }

        if (Schema::hasTable('mediclaim_hospital_contacts') && Schema::hasColumn('mediclaim_hospital_contacts', 'designation')) {
            Schema::table('mediclaim_hospital_contacts', function (Blueprint $table) {
                $table->string('designation')->nullable()->change();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mediclaim_hospitals') && Schema::hasColumn('mediclaim_hospitals', 'latitude')) {
            Schema::table('mediclaim_hospitals', function (Blueprint $table) {
                $table->dropColumn(['latitude', 'longitude']);
            });
        }

        if (Schema::hasTable('mediclaim_hospital_contacts') && Schema::hasColumn('mediclaim_hospital_contacts', 'name')) {
            Schema::table('mediclaim_hospital_contacts', function (Blueprint $table) {
                $table->dropColumn(['name', 'photo']);
            });
        }
    }
};
