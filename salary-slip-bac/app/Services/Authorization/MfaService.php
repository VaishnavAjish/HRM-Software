<?php

namespace App\Services\Authorization;

use App\Models\MfaMethod;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use PragmaRX\Google2FA\Google2FA;

/**
 * MFA Service — Domain 01.3 Multi-Factor Authentication.
 *
 * Centralized service for MFA operations including TOTP, backup codes,
 * and MFA verification. Supports multiple enrolled methods per user.
 */
class MfaService
{
    private Google2FA $google2fa;

    public function __construct()
    {
        $this->google2fa = new Google2FA();
    }

    /**
     * Generate a new TOTP secret for enrollment.
     */
    public function generateTotpSecret(): string
    {
        return $this->google2fa->generateSecretKey(32);
    }

    /**
     * Get the QR code URL for TOTP enrollment.
     */
    public function getTotpQrCodeUrl(User $user, string $secret): string
    {
        $companyName = config('app.name', 'HRMS');
        return $this->google2fa->getQRCodeGoogleUrl(
            $companyName,
            $user->email,
            $secret
        );
    }

    /**
     * Verify a TOTP code against a secret.
     */
    public function verifyTotp(string $secret, string $code): bool
    {
        return $this->google2fa->verifyKey($secret, $code);
    }

    /**
     * Enroll a new TOTP method for a user.
     */
    public function enrollTotp(User $user, string $secret, string $name = 'Authenticator App'): MfaMethod
    {
        // Deactivate any existing primary TOTP
        MfaMethod::where('user_id', $user->id)
            ->where('type', 'totp')
            ->where('is_primary', true)
            ->update(['is_primary' => false]);

        return MfaMethod::create([
            'user_id' => $user->id,
            'type' => 'totp',
            'name' => $name,
            'secret' => Hash::make($secret),
            'is_primary' => true,
            'is_active' => true,
            'enrolled_at' => now(),
        ]);
    }

    /**
     * Enroll SMS MFA method.
     */
    public function enrollSms(User $user, string $phoneNumber, string $name = 'SMS OTP'): MfaMethod
    {
        return MfaMethod::create([
            'user_id' => $user->id,
            'type' => 'sms',
            'name' => $name,
            'phone_number' => $phoneNumber,
            'is_primary' => false,
            'is_active' => true,
            'enrolled_at' => now(),
        ]);
    }

    /**
     * Enroll Email MFA method.
     */
    public function enrollEmail(User $user, string $email, string $name = 'Email OTP'): MfaMethod
    {
        return MfaMethod::create([
            'user_id' => $user->id,
            'type' => 'email',
            'name' => $name,
            'email' => $email,
            'is_primary' => false,
            'is_active' => true,
            'enrolled_at' => now(),
        ]);
    }

    /**
     * Generate backup codes for a user.
     */
    public function generateBackupCodes(User $user, int $count = 10): array
    {
        $codes = [];
        for ($i = 0; $i < $count; $i++) {
            $codes[] = Str::upper(Str::random(8));
        }

        // Deactivate existing backup codes
        MfaMethod::where('user_id', $user->id)
            ->where('type', 'backup_codes')
            ->update(['is_active' => false]);

        // Store encrypted backup codes
        MfaMethod::create([
            'user_id' => $user->id,
            'type' => 'backup_codes',
            'name' => 'Backup Codes',
            'backup_codes' => array_map(fn($code) => Hash::make($code), $codes),
            'is_primary' => false,
            'is_active' => true,
            'enrolled_at' => now(),
        ]);

        return $codes; // Return plaintext codes only once
    }

    /**
     * Verify a backup code and mark it as used.
     */
    public function verifyBackupCode(User $user, string $code): bool
    {
        $method = MfaMethod::where('user_id', $user->id)
            ->where('type', 'backup_codes')
            ->where('is_active', true)
            ->first();

        if (!$method || !$method->backup_codes) {
            return false;
        }

        foreach ($method->backup_codes as $index => $hashedCode) {
            if (Hash::check($code, $hashedCode)) {
                // Remove the used code
                $remainingCodes = array_values(array_diff_key($method->backup_codes, [$index => $hashedCode]));
                $method->backup_codes = $remainingCodes;
                $method->last_used_at = now();
                $method->save();
                return true;
            }
        }

        return false;
    }

    /**
     * Verify MFA for a user using any enrolled method.
     */
    public function verifyMfa(User $user, string $code, ?string $methodType = null): bool
    {
        $query = MfaMethod::where('user_id', $user->id)
            ->where('is_active', true);

        if ($methodType) {
            $query->where('type', $methodType);
        }

        $methods = $query->get();

        foreach ($methods as $method) {
            if ($this->verifyMethod($method, $code)) {
                $method->last_used_at = now();
                $method->save();
                return true;
            }
        }

        return false;
    }

    /**
     * Verify a specific MFA method.
     */
    private function verifyMethod(MfaMethod $method, string $code): bool
    {
        return match ($method->type) {
            'totp' => $this->verifyTotp($method->secret, $code),
            'backup_codes' => $this->verifyBackupCodeFromMethod($method, $code),
            'sms', 'email' => $this->verifyOtpCode($method, $code),
            'security_key' => $this->verifySecurityKey($method, $code),
            default => false,
        };
    }

    /**
     * Verify backup code from a specific method.
     */
    private function verifyBackupCodeFromMethod(MfaMethod $method, string $code): bool
    {
        if (!$method->backup_codes) {
            return false;
        }

        foreach ($method->backup_codes as $index => $hashedCode) {
            if (Hash::check($code, $hashedCode)) {
                $remainingCodes = array_values(array_diff_key($method->backup_codes, [$index => $hashedCode]));
                $method->backup_codes = $remainingCodes;
                $method->last_used_at = now();
                $method->save();
                return true;
            }
        }

        return false;
    }

    /**
     * Verify OTP code (SMS/Email) - would integrate with OTP service.
     */
    private function verifyOtpCode(MfaMethod $method, string $code): bool
    {
        // This would integrate with the existing OTP system
        // For now, return false as placeholder
        return false;
    }

    /**
     * Verify security key (WebAuthn) - placeholder for future implementation.
     */
    private function verifySecurityKey(MfaMethod $method, string $code): bool
    {
        // WebAuthn verification would go here
        return false;
    }

    /**
     * Get all active MFA methods for a user.
     */
    public function getUserMethods(User $user): \Illuminate\Database\Eloquent\Collection
    {
        return MfaMethod::where('user_id', $user->id)
            ->where('is_active', true)
            ->orderBy('is_primary', 'desc')
            ->orderBy('enrolled_at', 'desc')
            ->get();
    }

    /**
     * Check if user has MFA enabled.
     */
    public function hasMfaEnabled(User $user): bool
    {
        return MfaMethod::where('user_id', $user->id)
            ->where('is_active', true)
            ->exists();
    }

    /**
     * Check if user has a specific MFA type enabled.
     */
    public function hasMfaType(User $user, string $type): bool
    {
        return MfaMethod::where('user_id', $user->id)
            ->where('type', $type)
            ->where('is_active', true)
            ->exists();
    }

    /**
     * Revoke an MFA method.
     */
    public function revokeMethod(User $user, int $methodId): bool
    {
        $method = MfaMethod::where('user_id', $user->id)
            ->where('id', $methodId)
            ->first();

        if (!$method) {
            return false;
        }

        $method->is_active = false;
        $method->save();

        // If this was primary, promote another method
        if ($method->is_primary) {
            $nextMethod = MfaMethod::where('user_id', $user->id)
                ->where('is_active', true)
                ->where('id', '!=', $methodId)
                ->first();

            if ($nextMethod) {
                $nextMethod->is_primary = true;
                $nextMethod->save();
            }
        }

        return true;
    }

    /**
     * Set a method as primary.
     */
    public function setPrimary(User $user, int $methodId): bool
    {
        $method = MfaMethod::where('user_id', $user->id)
            ->where('id', $methodId)
            ->where('is_active', true)
            ->first();

        if (!$method) {
            return false;
        }

        // Remove primary from all other methods
        MfaMethod::where('user_id', $user->id)
            ->where('is_active', true)
            ->where('id', '!=', $methodId)
            ->update(['is_primary' => false]);

        $method->is_primary = true;
        $method->save();

        return true;
    }

    /**
     * Get remaining backup codes count.
     */
    public function getBackupCodesCount(User $user): int
    {
        $method = MfaMethod::where('user_id', $user->id)
            ->where('type', 'backup_codes')
            ->where('is_active', true)
            ->first();

        return $method?->backup_codes ? count($method->backup_codes) : 0;
    }

    /**
     * Regenerate backup codes.
     */
    public function regenerateBackupCodes(User $user, int $count = 10): array
    {
        return $this->generateBackupCodes($user, $count);
    }
}