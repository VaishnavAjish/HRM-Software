<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * `latitude`/`longitude` (added in `..._000039_...`) need the admin to look
 * up coordinates by hand — most admins will find it far easier to just open
 * the hospital in the Google Maps app/site, tap Share, and paste the link.
 * `google_maps_url` stores that raw link verbatim; when set, the employee
 * directory uses it directly as the click-through destination (no
 * transformation needed, unlike the embedded-map iframe, which still prefers
 * lat/lng or falls back to geocoding the address — a pasted share link
 * such as `https://maps.app.goo.gl/...` isn't embeddable via the
 * `output=embed` query format the iframe relies on).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('mediclaim_hospitals') && ! Schema::hasColumn('mediclaim_hospitals', 'google_maps_url')) {
            Schema::table('mediclaim_hospitals', function (Blueprint $table) {
                $table->text('google_maps_url')->nullable()->after('longitude');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('mediclaim_hospitals') && Schema::hasColumn('mediclaim_hospitals', 'google_maps_url')) {
            Schema::table('mediclaim_hospitals', function (Blueprint $table) {
                $table->dropColumn('google_maps_url');
            });
        }
    }
};
