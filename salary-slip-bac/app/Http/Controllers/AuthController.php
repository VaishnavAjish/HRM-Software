<?php

namespace App\Http\Controllers;

use App\Mail\PortalOtpMail;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;
use Tymon\JWTAuth\Facades\JWTAuth;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email'    => 'required|email',
            'password' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $credentials = $request->only('email', 'password');

        if (!$token = JWTAuth::attempt($credentials)) {
            return response()->json(['status' => false, 'message' => 'Invalid credentials'], 401);
        }

        JWTAuth::setToken($token);
        $user = JWTAuth::authenticate();

        if (!$user || $user->is_deleted == 1) {
            return response()->json(['status' => false, 'message' => 'Account is deactivated'], 403);
        }

        return response()->json([
            'status'      => true,
            'message'     => 'Login successful',
            'token'       => $token,
            'token_type'  => 'Bearer',
            'user'        => $user,
        ]);
    }

    public function me()
    {
        $user = auth('api')->user();
        if (!$user) {
            return response()->json(['status' => false, 'message' => 'User not found'], 404);
        }
        return response()->json(['status' => true, 'user' => $user]);
    }

    public function logout()
    {
        try {
            JWTAuth::invalidate(JWTAuth::getToken());
            return response()->json(['status' => true, 'message' => 'Logged out successfully']);
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => 'Failed to logout'], 500);
        }
    }

    public function register(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name'     => 'required',
            'email'    => 'required|email|unique:users',
            'password' => 'required|min:6',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = User::create([
            'name'     => $request->name,
            'email'    => $request->email,
            'password' => $request->password,
            'role'     => $request->role ?? 1,
        ]);

        $token = JWTAuth::fromUser($user);

        return response()->json([
            'status'  => true,
            'message' => 'User registered successfully',
            'token'   => $token,
            'user'    => $user,
        ]);
    }

    public function changePassword(Request $request)
    {
        $user = auth('api')->user();

        $validator = Validator::make($request->all(), [
            'password'        => 'required',
            'new_password'    => 'required|min:6',
            'confirm_password' => 'required|same:new_password',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        if (!Hash::check($request->password, $user->password)) {
            return response()->json(['status' => false, 'message' => 'Current password is incorrect'], 422);
        }

        $user->password = $request->new_password;
        $user->save();

        return response()->json(['status' => true, 'message' => 'Password changed successfully']);
    }

    public function newData(Request $request)
    {
        $type = $request->type;

        // Step 1: confirm the caller actually is the employee behind the code
        // (mobile + DOB cross-checked against records on file) before anything
        // that touches email/password is allowed to proceed.
        if ($type == 0) {
            return $this->verifyEmployeeIdentity($request);
        }

        // Step 2a: send an OTP to the email the employee wants on file.
        if ($type == 1) {
            return $this->sendPasswordResetOtp($request);
        }

        // Step 2b: verify that OTP.
        if ($type == 2) {
            return $this->verifyPasswordResetOtp($request);
        }

        // Step 3: set the new password.
        if ($type == 3) {
            return $this->setNewPasswordAfterVerification($request);
        }

        return response()->json(['status' => false, 'message' => 'Invalid request'], 400);
    }

    private function findEmployeeForReset(Request $request): ?User
    {
        return User::where('emp_code', $request->emp_code)
            ->where('company_code', $request->company_code ?? 'nidhi-impex')
            ->when($request->unit, fn ($q) => $q->where('unit', $request->unit))
            ->first();
    }

    /**
     * Loads the employee for this reset attempt only if it's carrying a
     * still-valid verification token issued by verifyEmployeeIdentity().
     * This is what stops someone who only knows an employee code (no mobile
     * number / DOB match) from reaching the OTP / password-set endpoints.
     */
    private function findVerifiedEmployee(Request $request): ?User
    {
        $emp = $this->findEmployeeForReset($request);

        if (!$emp || !$emp->verification_token || !$emp->verification_token_expires_at) {
            return null;
        }
        if (now()->greaterThan($emp->verification_token_expires_at)) {
            return null;
        }
        $submitted = (string) $request->verification_token;
        if ($submitted === '' || !hash_equals($emp->verification_token, hash('sha256', $submitted))) {
            return null;
        }

        return $emp;
    }

    private function verifyEmployeeIdentity(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'emp_code' => 'required',
            'mobile_number' => 'required',
            'dob' => 'required|date',
            'photo' => 'nullable|image|mimes:jpeg,jpg,png,webp|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        // This step decides who a not-yet-onboarded employee's account
        // belongs to (see the "first-time claim" comment below) with no
        // stronger proof than mobile+DOB, so both a single emp_code and a
        // single caller get a tight budget against guess/enumeration attempts.
        $perCodeKey = 'identity-verify:code:' . $request->emp_code;
        $perIpKey = 'identity-verify:ip:' . $request->ip();
        if (RateLimiter::tooManyAttempts($perCodeKey, 5) || RateLimiter::tooManyAttempts($perIpKey, 20)) {
            return response()->json(['status' => false, 'message' => 'Too many attempts. Please try again later.'], 429);
        }
        RateLimiter::hit($perCodeKey, 3600);
        RateLimiter::hit($perIpKey, 3600);

        $emp = $this->findEmployeeForReset($request);
        if (!$emp) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }
        if ($emp->is_deleted == 1) {
            return response()->json(['status' => false, 'message' => 'Account is deactivated'], 403);
        }

        $submittedMobile = preg_replace('/\D/', '', (string) $request->mobile_number);
        $submittedDob = date('Y-m-d', strtotime($request->dob));

        if (!empty($emp->mobile_number)) {
            $onFileMobile = preg_replace('/\D/', '', (string) $emp->mobile_number);
            if ($onFileMobile !== $submittedMobile) {
                return response()->json(['status' => false, 'message' => 'Details do not match our records'], 422);
            }
        }
        if (!empty($emp->dob)) {
            $onFileDob = date('Y-m-d', strtotime($emp->dob));
            if ($onFileDob !== $submittedDob) {
                return response()->json(['status' => false, 'message' => 'Details do not match our records'], 422);
            }
        }

        // First-time claim: nothing on file yet to check against, so capture
        // what was submitted. Once set, future attempts are cross-checked
        // against these values.
        if (empty($emp->mobile_number)) {
            $emp->mobile_number = $request->mobile_number;
        }
        if (empty($emp->dob)) {
            $emp->dob = $request->dob;
        }
        if (empty($emp->address) && $request->filled('address')) {
            $emp->address = $request->address;
        }
        if ($request->hasFile('photo') && empty($emp->photo)) {
            $emp->photo = $request->file('photo')->store('employee-photos', 'public');
        }

        $token = bin2hex(random_bytes(32));
        $emp->verification_token = hash('sha256', $token);
        $emp->verification_token_expires_at = now()->addMinutes(15);
        $emp->save();

        return response()->json([
            'status' => true,
            'message' => 'Identity verified',
            'data' => [
                'emp_code' => $emp->emp_code,
                'name' => $emp->name,
                'email' => $emp->email,
                'company_code' => $emp->company_code,
                'unit' => $emp->unit,
            ],
            'verification_token' => $token,
        ]);
    }

    private function sendPasswordResetOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'emp_code' => 'required',
            'email' => 'required|email',
            'verification_token' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $emp = $this->findVerifiedEmployee($request);
        if (!$emp) {
            return response()->json(['status' => false, 'message' => 'Verification expired. Please verify your employee code again.'], 422);
        }

        $emailTaken = User::where('email', $request->email)->where('id', '!=', $emp->id)->exists();
        if ($emailTaken) {
            return response()->json(['status' => false, 'message' => 'This email is already associated with another account'], 422);
        }

        $otp = (string) random_int(1000, 9999); // 4 digits — matches the OtpInput UI's 4-box entry

        try {
            Mail::to($request->email)->send(new PortalOtpMail($otp, $emp->name ?? 'there'));
        } catch (\Throwable $e) {
            Log::error('Failed to send OTP email: ' . $e->getMessage());
            return response()->json(['status' => false, 'message' => 'Could not send OTP email. Please try again later.'], 500);
        }

        $emp->email = $request->email;
        $emp->otp = $otp;
        $emp->save();

        return response()->json(['status' => true, 'message' => 'OTP sent to email']);
    }

    private function verifyPasswordResetOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'emp_code' => 'required',
            'otp' => 'required',
            'verification_token' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $emp = $this->findVerifiedEmployee($request);
        if (!$emp || !$emp->otp || (string) $emp->otp !== (string) $request->otp) {
            return response()->json(['status' => false, 'message' => 'Invalid OTP'], 422);
        }

        return response()->json(['status' => true, 'message' => 'OTP verified']);
    }

    private function setNewPasswordAfterVerification(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'emp_code' => 'required',
            'password' => 'required|min:6',
            'verification_token' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $emp = $this->findVerifiedEmployee($request);
        if (!$emp || !$emp->otp) {
            return response()->json(['status' => false, 'message' => 'Verification expired. Please verify your employee code again.'], 422);
        }

        $emp->password = $request->password;
        $emp->otp = null;
        $emp->verification_token = null;
        $emp->verification_token_expires_at = null;
        $emp->save();

        return response()->json(['status' => true, 'message' => 'Password reset successfully']);
    }
}
