<?php

namespace App\Support;

use App\Models\EsslSetting;
use App\Services\Authorization\SchemaSupport;

/**
 * eSSL biometric API connection config, read from the database
 * (essl_settings, a single row -- see EsslSetting) instead of .env.
 * EsslBiometricService reads through here rather than calling env()
 * directly, so an admin can rotate the (frequently-changing ngrok) tunnel
 * URL and credentials from the app without a server file edit or restart.
 *
 * Falls back to the legacy ESSL_* env vars only when the table/row doesn't
 * exist yet -- an environment that hasn't run the 2026_09_26_000002
 * migration (or has run it but the row was later deleted) keeps working
 * exactly as it did before this existed, rather than silently breaking.
 *
 * Values are cached per request, same reasoning as HelpdeskSettings: a sync
 * loop resolves this once per device/employee-day otherwise, which is a
 * query for a handful of values that cannot change mid-request.
 */
class EsslSettings
{
    private static ?array $cache = null;

    public static function all(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }

        if (! SchemaSupport::hasTable('essl_settings')) {
            return self::$cache = self::envFallback();
        }

        $row = EsslSetting::query()->first();
        if (! $row) {
            return self::$cache = self::envFallback();
        }

        return self::$cache = [
            'api_url' => (string) ($row->api_url ?: ''),
            'username' => (string) ($row->username ?: ''),
            // Decrypted transparently by EsslSetting's `'encrypted'` cast.
            'password' => (string) ($row->encrypted_password ?: ''),
            'namespace' => (string) ($row->namespace ?: 'http://tempuri.org/'),
            'max_concurrent_fetches' => max(1, (int) ($row->max_concurrent_fetches ?: 1)),
        ];
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return self::all()[$key] ?? $default;
    }

    /** Whether a usable connection is configured at all (URL + username + password). */
    public static function isConfigured(): bool
    {
        $s = self::all();

        return $s['api_url'] !== '' && $s['username'] !== '' && $s['password'] !== '';
    }

    /** Call after writing essl_settings, so the rest of the request sees the new values. */
    public static function flush(): void
    {
        self::$cache = null;
    }

    private static function envFallback(): array
    {
        return [
            'api_url' => (string) env('ESSL_API_URL', ''),
            'username' => (string) env('ESSL_USERNAME', ''),
            'password' => (string) env('ESSL_PASSWORD', ''),
            'namespace' => (string) env('ESSL_NAMESPACE', 'http://tempuri.org/'),
            'max_concurrent_fetches' => max(1, (int) env('ESSL_MAX_CONCURRENT_FETCHES', 1)),
        ];
    }
}
