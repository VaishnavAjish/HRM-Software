<?php

namespace App\Services\Sms;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class Fast2SmsService
{
    public function sendOtp(string $mobile, string $otp): bool
    {
        $key = (string) config('services.fast2sms.key');

        if ($key === '') {
            Log::error('Fast2SMS API key is not configured; login OTP not sent.');

            return false;
        }

        try {
            $response = Http::withHeaders(['authorization' => $key])
                ->asForm()
                ->timeout(15)
                ->post('https://www.fast2sms.com/dev/bulkV2', [
                    'route' => config('services.fast2sms.route', 'otp'),
                    'variables_values' => $otp,
                    'numbers' => $mobile,
                ]);
        } catch (\Throwable $e) {
            Log::error('Fast2SMS request failed', [
                'exception' => $e::class,
                'reason' => mb_substr($e->getMessage(), 0, 300),
            ]);

            return false;
        }

        if (! $response->successful() || $response->json('return') !== true) {
            Log::error('Fast2SMS rejected the OTP send', [
                'status' => $response->status(),
                'body' => mb_substr((string) $response->body(), 0, 300),
            ]);

            return false;
        }

        return true;
    }
}
