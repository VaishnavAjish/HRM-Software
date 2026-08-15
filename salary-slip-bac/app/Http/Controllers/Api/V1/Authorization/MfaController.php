<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\MfaMethod;
use App\Models\User;
use App\Services\Authorization\MfaService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class MfaController extends Controller
{
    public function __construct(
        private readonly MfaService $mfaService
    ) {}

    /**
     * Get all enrolled MFA methods for the authenticated user.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $methods = $this->mfaService->getUserMethods($user);

        return response()->json([
            'status' => true,
            'data' => $methods->map(fn($m) => [
                'id' => $m->id,
                'type' => $m->type,
                'type_label' => $m->getTypeLabel(),
                'name' => $m->name,
                'is_primary' => $m->is_primary,
                'is_active' => $m->is_active,
                'last_used_at' => $m->last_used_at?->toISOString(),
                'enrolled_at' => $m->enrolled_at?->toISOString(),
                'phone_number' => $m->phone_number ? $this->maskPhone($m->phone_number) : null,
                'email' => $m->email ? $this->maskEmail($m->email) : null,
                'backup_codes_count' => $m->type === 'backup_codes' ? $this->mfaService->getBackupCodesCount($user) : null,
            ]),
        ]);
    }

    /**
     * Initiate TOTP enrollment - returns secret and QR code.
     */
    public function initiateTotpEnrollment(Request $request)
    {
        $user = $request->user();

        // Check if user already has a primary TOTP
        $existing = MfaMethod::where('user_id', $user->id)
            ->where('type', 'totp')
            ->where('is_primary', true)
            ->first();

        if ($existing) {
            return response()->json([
                'status' => false,
                'message' => 'You already have an authenticator app enrolled. Remove it first to add a new one.',
            ], 400);
        }

        $secret = $this->mfaService->generateTotpSecret();
        $qrCodeUrl = $this->mfaService->getTotpQrCodeUrl($user, $secret);

        return response()->json([
            'status' => true,
            'data' => [
                'secret' => $secret,
                'qr_code_url' => $qrCodeUrl,
                'manual_entry_key' => $secret,
            ],
        ]);
    }

    /**
     * Complete TOTP enrollment by verifying the code.
     */
    public function completeTotpEnrollment(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'secret' => 'required|string',
            'code' => 'required|digits:6',
            'name' => 'nullable|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = $request->user();
        $secret = $request->input('secret');
        $code = $request->input('code');
        $name = $request->input('name', 'Authenticator App');

        // Verify the code
        if (!$this->mfaService->verifyTotp($secret, $code)) {
            return response()->json(['status' => false, 'message' => 'Invalid code. Please try again.'], 400);
        }

        // Enroll the method
        $method = $this->mfaService->enrollTotp($user, $secret, $name);

        return response()->json([
            'status' => true,
            'message' => 'Authenticator app enrolled successfully',
            'data' => [
                'id' => $method->id,
                'type' => $method->type,
                'name' => $method->name,
                'is_primary' => $method->is_primary,
            ],
        ]);
    }

    /**
     * Enroll SMS MFA.
     */
    public function enrollSms(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'phone_number' => 'required|string|max:20',
            'name' => 'nullable|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = $request->user();
        $phoneNumber = $request->input('phone_number');
        $name = $request->input('name', 'SMS OTP');

        // TODO: Send verification SMS and verify code before enrolling
        // For now, just enroll
        $method = $this->mfaService->enrollSms($user, $phoneNumber, $name);

        return response()->json([
            'status' => true,
            'message' => 'SMS MFA enrolled successfully',
            'data' => [
                'id' => $method->id,
                'type' => $method->type,
                'name' => $method->name,
            ],
        ]);
    }

    /**
     * Enroll Email MFA.
     */
    public function enrollEmail(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|max:190',
            'name' => 'nullable|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = $request->user();
        $email = $request->input('email');
        $name = $request->input('name', 'Email OTP');

        $method = $this->mfaService->enrollEmail($user, $email, $name);

        return response()->json([
            'status' => true,
            'message' => 'Email MFA enrolled successfully',
            'data' => [
                'id' => $method->id,
                'type' => $method->type,
                'name' => $method->name,
            ],
        ]);
    }

    /**
     * Generate backup codes.
     */
    public function generateBackupCodes(Request $request)
    {
        $user = $request->user();

        // Check if user already has backup codes
        $existing = MfaMethod::where('user_id', $user->id)
            ->where('type', 'backup_codes')
            ->where('is_active', true)
            ->first();

        if ($existing) {
            return response()->json([
                'status' => false,
                'message' => 'You already have backup codes. Regenerate them instead.',
            ], 400);
        }

        $codes = $this->mfaService->generateBackupCodes($user);

        return response()->json([
            'status' => true,
            'message' => 'Backup codes generated. Save them securely - they will not be shown again.',
            'data' => [
                'codes' => $codes,
            ],
        ]);
    }

    /**
     * Regenerate backup codes.
     */
    public function regenerateBackupCodes(Request $request)
    {
        $user = $request->user();
        $codes = $this->mfaService->regenerateBackupCodes($user);

        return response()->json([
            'status' => true,
            'message' => 'Backup codes regenerated. Save them securely - they will not be shown again.',
            'data' => [
                'codes' => $codes,
            ],
        ]);
    }

    /**
     * Verify MFA code (for step-up authentication).
     */
    public function verify(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'code' => 'required|string',
            'method_type' => 'nullable|string|in:totp,sms,email,push,security_key,backup_codes',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = $request->user();
        $code = $request->input('code');
        $methodType = $request->input('method_type');

        $verified = $this->mfaService->verifyMfa($user, $code, $methodType);

        if (!$verified) {
            return response()->json(['status' => false, 'message' => 'Invalid code'], 401);
        }

        return response()->json([
            'status' => true,
            'message' => 'MFA verified successfully',
        ]);
    }

    /**
     * Revoke an MFA method.
     */
    public function revoke(Request $request, int $methodId)
    {
        $user = $request->user();

        $revoked = $this->mfaService->revokeMethod($user, $methodId);

        if (!$revoked) {
            return response()->json(['status' => false, 'message' => 'MFA method not found'], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'MFA method revoked successfully',
        ]);
    }

    /**
     * Set an MFA method as primary.
     */
    public function setPrimary(Request $request, int $methodId)
    {
        $user = $request->user();

        $set = $this->mfaService->setPrimary($user, $methodId);

        if (!$set) {
            return response()->json(['status' => false, 'message' => 'MFA method not found or inactive'], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'Primary MFA method updated',
        ]);
    }

    /**
     * Check if user has MFA enabled.
     */
    public function status(Request $request)
    {
        $user = $request->user();
        $hasMfa = $this->mfaService->hasMfaEnabled($user);
        $methods = $this->mfaService->getUserMethods($user);

        return response()->json([
            'status' => true,
            'data' => [
                'mfa_enabled' => $hasMfa,
                'methods_count' => $methods->count(),
                'has_totp' => $this->mfaService->hasMfaType($user, 'totp'),
                'has_sms' => $this->mfaService->hasMfaType($user, 'sms'),
                'has_email' => $this->mfaService->hasMfaType($user, 'email'),
                'has_backup_codes' => $this->mfaService->hasMfaType($user, 'backup_codes'),
                'backup_codes_remaining' => $this->mfaService->getBackupCodesCount($user),
            ],
        ]);
    }

    private function maskPhone(string $phone): string
    {
        if (strlen($phone) <= 4) {
            return str_repeat('*', strlen($phone));
        }
        return str_repeat('*', strlen($phone) - 4) . substr($phone, -4);
    }

    private function maskEmail(string $email): string
    {
        $parts = explode('@', $email);
        if (count($parts) !== 2) {
            return str_repeat('*', strlen($email));
        }
        $local = $parts[0];
        $domain = $parts[1];
        $maskedLocal = strlen($local) > 2
            ? substr($local, 0, 1) . str_repeat('*', strlen($local) - 2) . substr($local, -1)
            : str_repeat('*', strlen($local));
        return $maskedLocal . '@' . $domain;
    }
}