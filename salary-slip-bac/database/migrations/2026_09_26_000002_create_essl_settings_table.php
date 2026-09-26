<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * eSSL biometric API connection settings, moved out of .env and into the
 * database (App\Models\EsslSetting, read via App\Support\EsslSettings) so an
 * admin can rotate the tunnel URL/credentials from the app instead of
 * editing a server file. It's a single-row table, not a per-user setting.
 *
 * The row is seeded here from whatever ESSL_* values already exist in this
 * environment's .env at migration time, so an already-working deployment
 * keeps working the moment this runs -- no manual re-entry required. The
 * password is encrypted the same way EsslSetting's `'encrypted'` cast would
 * (Crypt::encryptString), since this raw DB::table() insert bypasses casts.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('essl_settings')) {
            return;
        }

        Schema::create('essl_settings', function (Blueprint $table) {
            $table->id();
            $table->string('api_url')->nullable();
            $table->string('username')->nullable();
            $table->text('encrypted_password')->nullable();
            $table->string('namespace')->nullable();
            $table->unsignedInteger('max_concurrent_fetches')->default(1);
            $table->timestamps();
        });

        $envPassword = env('ESSL_PASSWORD');
        $encryptedPassword = null;
        if ($envPassword) {
            try {
                $encryptedPassword = Crypt::encryptString($envPassword);
            } catch (\Throwable $e) {
                // Ignore encryption error during migration if APP_KEY is invalid/not set
            }
        }

        DB::table('essl_settings')->insert([
            'api_url' => env('ESSL_API_URL'),
            'username' => env('ESSL_USERNAME'),
            'encrypted_password' => $encryptedPassword,
            'namespace' => env('ESSL_NAMESPACE', 'http://tempuri.org/'),
            'max_concurrent_fetches' => max(1, (int) env('ESSL_MAX_CONCURRENT_FETCHES', 1)),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('essl_settings');
    }
};
