<?php

namespace App\Http\Controllers\Candidate;

use App\Http\Controllers\Controller;
use App\Mail\CandidateResetPasswordMail;
use App\Mail\CandidateVerifyEmailMail;
use App\Models\CandidateAccount;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

class CandidateAuthController extends Controller
{
    public function register(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:candidate_accounts,email',
            'password' => 'required|string|min:8|confirmed',
            'phone' => 'nullable|string|max:30',
        ]);

        $verificationToken = Str::random(60);

        $account = CandidateAccount::create([
            'name' => $data['name'],
            'email' => strtolower(trim($data['email'])),
            'password' => Hash::make($data['password']),
            'phone' => $data['phone'] ?? null,
            'verification_token' => hash('sha256', $verificationToken),
            'verification_token_expires_at' => now()->addHours(24),
        ]);

        $token = $account->createToken('candidate_auth')->plainTextToken;

        $this->sendVerificationEmail($account, $verificationToken);

        return response()->json([
            'status' => true,
            'message' => 'Registration successful. Please verify your email.',
            'token' => $token,
            'candidate' => $account,
        ], 201);
    }

    /**
     * Best-effort — a mail-server hiccup shouldn't fail registration itself,
     * since the account already exists regardless of whether the email made
     * it out (the candidate can still request a fresh link later).
     */
    private function sendVerificationEmail(CandidateAccount $account, string $rawToken): void
    {
        if (!$account->email) {
            return;
        }

        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');
        if (!$frontendUrl) {
            Log::critical('candidate_verify_email_skipped_no_frontend_url', ['candidate_account_id' => $account->id]);
            return;
        }

        $verifyUrl = $frontendUrl . '/careers/verify-email?email=' . urlencode($account->email) . '&token=' . urlencode($rawToken);

        try {
            Mail::to($account->email)->send(new CandidateVerifyEmailMail(
                candidateName: $account->name,
                verifyUrl: $verifyUrl,
            ));
        } catch (\Throwable $e) {
            Log::error('candidate_verify_email_mail_failed', ['candidate_account_id' => $account->id, 'error' => $e->getMessage()]);
        }
    }

    public function verifyEmail(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'token' => 'required|string',
        ]);

        $hashedToken = hash('sha256', $data['token']);
        $account = CandidateAccount::where('email', strtolower(trim($data['email'])))
            ->where('verification_token', $hashedToken)
            ->first();

        if (! $account) {
            return response()->json(['status' => false, 'message' => 'Invalid or expired verification token.'], 422);
        }

        if ($account->verification_token_expires_at && $account->verification_token_expires_at->isPast()) {
            return response()->json(['status' => false, 'message' => 'Verification token has expired.'], 422);
        }

        $account->update([
            'email_verified_at' => now(),
            'verification_token' => null,
            'verification_token_expires_at' => null,
        ]);

        return response()->json(['status' => true, 'message' => 'Email verified successfully.', 'candidate' => $account->fresh()]);
    }

    /**
     * Same generic response whether the email is unknown, already verified,
     * or genuinely unverified — this endpoint must not be usable to test
     * which candidate emails are registered or already confirmed. Issuing a
     * fresh token overwrites the single verification_token column, so any
     * link from a previous email stops working the moment this one is sent.
     */
    public function resendVerification(Request $request)
    {
        $data = $request->validate(['email' => 'required|email']);
        $account = CandidateAccount::where('email', strtolower(trim($data['email'])))->first();

        if ($account && ! $account->email_verified_at) {
            $rawToken = Str::random(60);
            $account->update([
                'verification_token' => hash('sha256', $rawToken),
                'verification_token_expires_at' => now()->addHours(24),
            ]);

            $this->sendVerificationEmail($account, $rawToken);
        }

        return response()->json([
            'status' => true,
            'message' => 'If the account exists and requires verification, a verification email has been sent.',
        ]);
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $account = CandidateAccount::where('email', strtolower(trim($data['email'])))->first();

        if (! $account || ! Hash::check($data['password'], $account->password)) {
            return response()->json(['status' => false, 'message' => 'Invalid email or password credentials.'], 401);
        }

        // Keep personal_access_tokens table lean by pruning older tokens for this candidate
        $account->tokens()->where('name', 'candidate_auth')->delete();

        $token = $account->createToken('candidate_auth')->plainTextToken;

        return response()->json([
            'status' => true,
            'message' => 'Login successful',
            'token' => $token,
            'candidate' => $account,
        ]);
    }

    public function logout(Request $request)
    {
        $user = $request->user();
        if ($user && method_exists($user, 'currentAccessToken')) {
            $user->currentAccessToken()?->delete();
        }

        return response()->json(['status' => true, 'message' => 'Logged out successfully']);
    }

    public function me(Request $request)
    {
        return response()->json(['status' => true, 'candidate' => $request->user()]);
    }

    public function updateProfile(Request $request)
    {
        $account = $request->user();
        $data = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'phone' => 'nullable|string|max:30',
            'skills' => 'nullable|array',
            'current_company' => 'nullable|string|max:255',
            'current_designation' => 'nullable|string|max:255',
            'experience_years' => 'nullable|numeric|min:0',
        ]);

        $account->update($data);

        return response()->json(['status' => true, 'message' => 'Profile updated successfully', 'candidate' => $account->fresh()]);
    }

    public function forgotPassword(Request $request)
    {
        $data = $request->validate(['email' => 'required|email']);
        $account = CandidateAccount::where('email', strtolower(trim($data['email'])))->first();

        if ($account) {
            $rawToken = Str::random(60);
            $account->update([
                'reset_password_token' => hash('sha256', $rawToken),
                'reset_password_token_expires_at' => now()->addHours(2),
            ]);

            $this->sendResetPasswordEmail($account, $rawToken);
        }

        // Identical response whether or not the account exists, so this
        // endpoint cannot be used to enumerate registered candidate emails.
        return response()->json(['status' => true, 'message' => 'If your email is registered, password reset instructions have been sent.']);
    }

    private function sendResetPasswordEmail(CandidateAccount $account, string $rawToken): void
    {
        if (!$account->email) {
            return;
        }

        $frontendUrl = rtrim((string) config('services.frontend_url'), '/');
        if (!$frontendUrl) {
            Log::critical('candidate_reset_password_skipped_no_frontend_url', ['candidate_account_id' => $account->id]);
            return;
        }

        $resetUrl = $frontendUrl . '/careers/reset-password?email=' . urlencode($account->email) . '&token=' . urlencode($rawToken);

        try {
            Mail::to($account->email)->send(new CandidateResetPasswordMail(
                candidateName: $account->name,
                resetUrl: $resetUrl,
            ));
        } catch (\Throwable $e) {
            Log::error('candidate_reset_password_mail_failed', ['candidate_account_id' => $account->id, 'error' => $e->getMessage()]);
        }
    }

    public function resetPassword(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'token' => 'required|string',
            'password' => 'required|string|min:8|confirmed',
        ]);

        $hashedToken = hash('sha256', $data['token']);
        $account = CandidateAccount::where('email', strtolower(trim($data['email'])))
            ->where('reset_password_token', $hashedToken)
            ->first();

        if (! $account || ($account->reset_password_token_expires_at && $account->reset_password_token_expires_at->isPast())) {
            return response()->json(['status' => false, 'message' => 'Invalid or expired password reset token.'], 422);
        }

        $account->update([
            'password' => Hash::make($data['password']),
            'reset_password_token' => null,
            'reset_password_token_expires_at' => null,
        ]);

        return response()->json(['status' => true, 'message' => 'Password reset successfully. Please login.']);
    }
}
