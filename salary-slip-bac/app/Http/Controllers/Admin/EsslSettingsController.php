<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\EsslSetting;
use App\Support\AuditLogger;
use App\Support\EsslSettings;
use Illuminate\Http\Request;

/**
 * Admin-facing read/update for the eSSL biometric API connection
 * (essl_settings, a single row) -- lets the tunnel URL/credentials be
 * rotated from the app instead of editing .env on the server. See
 * App\Support\EsslSettings for the read side EsslBiometricService actually
 * uses at sync time.
 */
class EsslSettingsController extends Controller
{
    /**
     * The password itself is never sent back to the browser -- only
     * whether one is currently set (`has_password`) -- so the form can
     * show "configured" without ever re-transmitting the secret.
     */
    public function show()
    {
        $row = EsslSetting::query()->first();

        return response()->json([
            'status' => true,
            'data' => [
                'api_url' => $row->api_url ?? '',
                'username' => $row->username ?? '',
                'namespace' => $row->namespace ?? 'http://tempuri.org/',
                'max_concurrent_fetches' => $row->max_concurrent_fetches ?? 1,
                'has_password' => (bool) ($row->encrypted_password ?? null),
            ],
        ]);
    }

    public function update(Request $request)
    {
        $data = $request->validate([
            'api_url' => ['required', 'string', 'max:500'],
            'username' => ['required', 'string', 'max:190'],
            // Optional: leave blank to keep the currently stored password.
            'password' => ['nullable', 'string', 'max:255'],
            'namespace' => ['nullable', 'string', 'max:190'],
            'max_concurrent_fetches' => ['required', 'integer', 'min:1', 'max:20'],
        ]);

        $row = EsslSetting::query()->first();
        $before = $row ? [
            'api_url' => $row->api_url,
            'username' => $row->username,
            'namespace' => $row->namespace,
            'max_concurrent_fetches' => $row->max_concurrent_fetches,
            'password' => $row->encrypted_password ? '••••••••' : null,
        ] : null;

        $values = [
            'api_url' => trim($data['api_url']),
            'username' => trim($data['username']),
            'namespace' => trim((string) ($data['namespace'] ?? '')) ?: 'http://tempuri.org/',
            'max_concurrent_fetches' => (int) $data['max_concurrent_fetches'],
        ];

        // Assigning the plain password to `encrypted_password` here is
        // encrypted transparently by EsslSetting's `'encrypted'` cast on
        // save -- never written or logged as plaintext.
        if (!empty($data['password'])) {
            $values['encrypted_password'] = $data['password'];
        }

        if ($row) {
            $row->update($values);
        } else {
            $row = EsslSetting::create($values);
        }

        EsslSettings::flush();

        AuditLogger::log($request, 'UPDATE', 'eSSL Biometric Settings', $before, [
            'api_url' => $values['api_url'],
            'username' => $values['username'],
            'namespace' => $values['namespace'],
            'max_concurrent_fetches' => $values['max_concurrent_fetches'],
            'password' => isset($values['encrypted_password']) ? '••••••••' : ($before['password'] ?? null),
        ]);

        return response()->json([
            'status' => true,
            'message' => 'eSSL biometric connection settings saved',
            'data' => [
                'api_url' => $row->api_url,
                'username' => $row->username,
                'namespace' => $row->namespace,
                'max_concurrent_fetches' => $row->max_concurrent_fetches,
                'has_password' => (bool) $row->encrypted_password,
            ],
        ]);
    }
}
