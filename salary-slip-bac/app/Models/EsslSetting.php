<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Single-row table holding the eSSL biometric API connection config
 * (previously ESSL_API_URL/ESSL_USERNAME/ESSL_PASSWORD/ESSL_NAMESPACE/
 * ESSL_MAX_CONCURRENT_FETCHES in .env -- see the 2026_09_26_000002 migration).
 *
 * `encrypted_password` is AES-256 encrypted at rest via APP_KEY (Laravel's
 * `'encrypted'` cast) and hidden from every array/JSON representation,
 * mirroring User::encrypted_aadhaar_number: read it explicitly server-side
 * only (App\Support\EsslSettings), never via ->toArray()/->toJson().
 */
class EsslSetting extends Model
{
    protected $table = 'essl_settings';

    protected $fillable = [
        'api_url', 'username', 'encrypted_password', 'namespace', 'max_concurrent_fetches',
    ];

    protected $hidden = ['encrypted_password'];

    protected function casts(): array
    {
        return [
            'encrypted_password' => 'encrypted',
            'max_concurrent_fetches' => 'integer',
        ];
    }
}
