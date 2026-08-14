<?php

namespace App\Http\Controllers\Candidate;

use App\Http\Controllers\Controller;
use App\Models\CandidateAccount;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
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

        return response()->json([
            'status' => true,
            'message' => 'Registration successful. Please verify your email.',
            'token' => $token,
            'verification_token' => $verificationToken, // Returned for dev/testing ease
            'candidate' => $account,
        ], 201);
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

            return response()->json([
                'status' => true,
                'message' => 'If your email is registered, password reset instructions have been sent.',
                'reset_token' => $rawToken,
            ]);
        }

        return response()->json(['status' => true, 'message' => 'If your email is registered, password reset instructions have been sent.']);
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
