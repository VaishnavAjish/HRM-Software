<?php

namespace App\Services\Sms;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class Fast2SmsService
{
    /**
     * PHP/cURL on Windows doesn't ship its own CA trust store — it relies on
     * whatever curl.cainfo/openssl.cafile happens to be configured system-wide
     * (typically XAMPP's bundled curl-ca-bundle.crt), which is easy to leave
     * stale for years and then fail every outbound HTTPS call with "unable to
     * get local issuer certificate". Pinning to a CA bundle shipped inside the
     * app removes that dependency entirely, on this machine or any other this
     * code is deployed to.
     */
    private function verifyOption(): string
    {
        return storage_path('certs/cacert.pem');
    }

    public function sendOtp(string $mobile, string $otp): bool
    {
        $key = (string) config('services.fast2sms.key');

        if ($key === '') {
            Log::error('Fast2SMS API key is not configured; login OTP not sent.');

            return false;
        }

        try {
            $route = config('services.fast2sms.route', 'otp');
            $payload = [
                'route' => $route,
                'numbers' => $mobile,
            ];
            if ($route === 'otp') {
                $payload['variables_values'] = $otp;
            } else {
                $payload['message'] = "Your Nidhi Impex verification OTP is {$otp}. Valid for 10 minutes.";
            }

            $response = Http::withHeaders(['authorization' => $key])
                ->withOptions(['verify' => $this->verifyOption()])
                ->asForm()
                ->timeout(15)
                ->post('https://www.fast2sms.com/dev/bulkV2', $payload);

            // If OTP route is blocked (e.g. status 996 website verification required or status 999), try 'q' (Quick SMS) route
            if (! $response->successful() && $route === 'otp') {
                Log::warning('Fast2SMS OTP route rejected, attempting fallback route q', [
                    'body' => mb_substr((string) $response->body(), 0, 300),
                ]);

                $response = Http::withHeaders(['authorization' => $key])
                    ->withOptions(['verify' => $this->verifyOption()])
                    ->asForm()
                    ->timeout(15)
                    ->post('https://www.fast2sms.com/dev/bulkV2', [
                        'route' => 'q',
                        'message' => "Your Nidhi Impex verification OTP is {$otp}. Valid for 10 minutes.",
                        'numbers' => $mobile,
                    ]);
            }
        } catch (\Throwable $e) {
            Log::error('Fast2SMS request failed', [
                'exception' => $e::class,
                'reason' => mb_substr($e->getMessage(), 0, 300),
            ]);

            return false;
        }

        if (! $response->successful() || ($response->json('return') !== true && ! str_contains(strtolower((string)$response->body()), 'sent'))) {
            Log::error('Fast2SMS rejected the OTP send', [
                'status' => $response->status(),
                'body' => mb_substr((string) $response->body(), 0, 300),
            ]);

            return false;
        }

        return true;
    }
}
