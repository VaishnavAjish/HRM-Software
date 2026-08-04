<?php

namespace App\Http\Controllers;

use App\Mail\PortalOtpMail;
use App\Models\User;
use App\Services\Authorization\SchemaSupport;
use App\Support\AadhaarDisclosure;
use App\Support\AadhaarReference;
use App\Support\AuthSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Tymon\JWTAuth\Facades\JWTAuth;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required',
            'password' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $loginInput = trim((string) $request->input('email'));
        $password = $request->input('password');

        $field = filter_var($loginInput, FILTER_VALIDATE_EMAIL) ? 'email' : 'emp_code';

        $credentials = [
            $field => $loginInput,
            'password' => $password,
        ];

        if (! $token = JWTAuth::attempt($credentials)) {
            return response()->json(['status' => false, 'message' => 'Invalid credentials'], 401);
        }

        JWTAuth::setToken($token);
        $user = JWTAuth::authenticate();

        if (! $user || $user->is_deleted == 1) {
            return response()->json(['status' => false, 'message' => 'Account is deactivated'], 403);
        }

        if ($denial = $this->accountDenial($user)) {
            try {
                JWTAuth::invalidate($token);
            } catch (\Throwable $e) {
                report($e);
            }

            $this->recordLoginEvent($request, $user, 'failed', $denial['reason']);

            return response()->json(['status' => false, 'message' => $denial['message']], 403);
        }

        if ((int) $user->status === 2) {
            $user->status = 0;
            $user->save();
        }

        $this->stampLogin($request, $user);
        $this->recordLoginEvent($request, $user, 'success', null);

        // Never cacheable: this response carries a bearer token. A shared cache
        // replaying it would hand one user another user's session.
        return AuthSession::noStore(response()->json([
            'status' => true,
            'message' => 'Login successful',
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user,
        ]));
    }

    /**
     * JWTAuth::attempt() only knows whether the password is right, and Access
     * Control > Users can suspend an account without changing it, so the state
     * has to be read after authentication and before a token is handed out.
     *
     * @return array{reason:string,message:string}|null
     */
    private function accountDenial(User $user): ?array
    {
        if (SchemaSupport::hasColumn('users', 'locked_at') && $user->locked_at) {
            return ['reason' => 'account_locked', 'message' => 'This account is locked. Contact your administrator.'];
        }

        if (SchemaSupport::hasColumn('users', 'deactivated_at') && $user->deactivated_at) {
            return ['reason' => 'account_deactivated', 'message' => 'This account is deactivated. Contact your administrator.'];
        }

        return null;
    }

    private function stampLogin(Request $request, User $user): void
    {
        if (! SchemaSupport::hasColumn('users', 'last_login_at')) {
            return;
        }

        $values = ['last_login_at' => now()];

        if (SchemaSupport::hasColumn('users', 'last_login_ip')) {
            $values['last_login_ip'] = substr((string) $request->ip(), 0, 45);
        }

        try {
            DB::table('users')->where('id', $user->id)->update($values);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function recordLoginEvent(Request $request, ?User $user, string $result, ?string $reason): void
    {
        if (! SchemaSupport::hasTable('login_events')) {
            return;
        }

        try {
            DB::table('login_events')->insert([
                'user_id' => $user?->id,
                'email' => substr((string) ($user?->email ?: $request->input('email')), 0, 190),
                'result' => $result,
                'reason' => $reason,
                'ip' => substr((string) $request->ip(), 0, 45),
                'user_agent' => substr((string) $request->userAgent(), 0, 500),
                'created_at' => now(),
            ]);
        } catch (\Throwable $e) {
            report($e);
        }
    }

    public function me()
    {
        $user = auth('api')->user();
        if (! $user) {
            return response()->json(['status' => false, 'message' => 'User not found'], 404);
        }

        // Your own profile: you own this identity document, so the complete
        // number is disclosed without needing a grant. toArray() still hides the
        // raw column; aadhaar_full is added explicitly.
        $payload = AadhaarDisclosure::attach(
            $user->toArray(),
            $user,
            $user,
            'EMPLOYEE_FULL_AADHAAR_VIEWED'
        );

        // The authoritative current-user response. Must not be cached, or the
        // next user through a shared cache receives this identity.
        return AuthSession::noStore(response()->json(['status' => true, 'user' => $payload]));
    }

    /**
     * End the caller's session.
     *
     * Deliberately idempotent and unconditionally successful. The previous
     * implementation called JWTAuth::invalidate(JWTAuth::getToken()) unguarded,
     * so a logout arriving with an expired, malformed or absent token threw and
     * returned 500 — and because the route also sat behind the jwt.auth
     * middleware, such a request never reached this method at all. The token was
     * therefore never blacklisted, and with a 30-day TTL it stayed valid for up
     * to a month on whatever machine still held it while the user believed they
     * had signed out.
     *
     * Logout now runs outside that middleware and treats every failure mode as a
     * successful logout: there is no state in which telling the client "you are
     * still signed in" is the safer answer.
     */
    public function logout()
    {
        $revoked = AuthSession::revokeCurrentToken();

        if (! $revoked) {
            // Already logged without the token by AuthSession. The client is
            // still told to discard its session — a blacklist that is refusing
            // writes must not keep the user signed in.
            report(new \RuntimeException('Token revocation failed during logout.'));
        }

        return AuthSession::noStore(response()->json([
            'status' => true,
            'message' => 'Logged out successfully',
        ]));
    }

    public function register(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required',
            'email' => 'required|email|unique:users',
            'password' => 'required|min:6',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $actingUser = auth('api')->user();
        $requestedRole = (int) ($request->role ?? 3);

        // SECURITY FIX: Prevent privilege escalation.
        // Only a Super Admin (role 0) may create Admin (1) or Super Admin (0) accounts.
        // Agents (4) are created by Admins but never by this endpoint's role param.
        if (in_array($requestedRole, [0, 1], true)) {
            if (! $actingUser || (int) $actingUser->role !== 0) {
                return response()->json(['status' => false, 'message' => 'Only a Super Admin can create Admin/Super Admin accounts'], 403);
            }
        }

        // An account scoped to more than one company must be a Master admin
        // (role 1) — AdminController::dashboard() and the other admin-scoped
        // queries only skip their company filter for role 0/1, so any other
        // role assigned to multiple companies would end up filtered down to
        // whatever narrow (often empty) match its own role's branch applies.
        // Agents (role 4) are exempt: they already support multi-company
        // scope through their own `type` check elsewhere in the app and must
        // never be silently promoted to Admin just for spanning companies.
        $companyCode = trim((string) $request->company_code);
        $companyCount = $companyCode === '' ? 0 : count(array_filter(array_map('trim', explode(',', $companyCode))));
        if ($companyCount > 1 && $requestedRole !== 4) {
            $requestedRole = 1;
        }

        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => $request->password,
            'role' => $requestedRole,
            'company_code' => $request->company_code,
            // This is the only creation path for RBAC admin/agent accounts —
            // they log in with email + password directly, never claim an
            // emp_code. Leaving it null left both `type` and `emp_code` null,
            // which is exactly what UserController::getAppointment treats as
            // a pending appointment, so every admin/agent created here leaked
            // into the Appointments list. UserController::store already
            // avoids this for the employee-creation path by forcing a code;
            // mirror that here.
            'emp_code' => strtoupper(Str::random(8)),
            // Role 4 (Agent) isn't excluded by role in UserController::index
            // (View Employees) the way Admin/Super Admin are — only its
            // `type` is checked there, and 'agent' is the value the rest of
            // the app already keys off (e.g. added_by scoping). Without it,
            // fixing the emp_code above would have made agents newly leak
            // into View Employees instead of Appointments.
            'type' => $requestedRole === 4 ? 'agent' : null,
        ]);

        $token = JWTAuth::fromUser($user);

        return response()->json([
            'status' => true,
            'message' => 'User registered successfully',
            'token' => $token,
            'user' => $user,
        ]);
    }

    public function changePassword(Request $request)
    {
        $user = auth('api')->user();

        $validator = Validator::make($request->all(), [
            'password' => 'required',
            'new_password' => 'required|min:6',
            'confirm_password' => 'required|same:new_password',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        if (! Hash::check($request->password, $user->password)) {
            return response()->json(['status' => false, 'message' => 'Current password is incorrect'], 422);
        }

        $user->password = $request->new_password;
        $user->save();

        return response()->json(['status' => true, 'message' => 'Password changed successfully']);
    }

    public function checkEmpCode($code)
    {
        $emp = User::where('emp_code', $code)->first();
        if ($emp) {
            return response()->json([
                'status' => true,
                'company_code' => $emp->company_code,
                'unit' => $emp->unit,
            ]);
        }

        return response()->json(['status' => false, 'message' => 'Not found'], 404);
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

        if (! $emp || ! $emp->verification_token || ! $emp->verification_token_expires_at) {
            return null;
        }
        if (now()->greaterThan($emp->verification_token_expires_at)) {
            return null;
        }
        $submitted = (string) $request->verification_token;
        if ($submitted === '' || ! hash_equals($emp->verification_token, hash('sha256', $submitted))) {
            return null;
        }

        return $emp;
    }

    private function verifyEmployeeIdentity(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'emp_code' => 'required',
            'photo' => 'nullable|image|mimes:jpeg,jpg,png,webp|max:5120',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $emp = $this->findEmployeeForReset($request);
        if (! $emp) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }
        if ($emp->is_deleted == 1) {
            return response()->json(['status' => false, 'message' => 'Account is deactivated'], 403);
        }

        // The "Verify Employee" screen collects an Aadhaar card number, not a
        // mobile number — the frontend sends it under several legacy field
        // name aliases (aadhar_card_no, aadhaar_no, mobile_number, ...) left
        // over from earlier iterations of this flow. This used to validate
        // $request->mobile_number against $emp->mobile_number, which meant
        // the Aadhaar the user actually typed was never checked and instead
        // compared (as a "mobile number") against the real mobile on file —
        // failing for every already-registered employee.
        $submittedAadhaar = AadhaarReference::normalise((string) (
            $request->aadhar_card_no
                ?? $request->aadhaar_card_no
                ?? $request->aadhar_no
                ?? $request->aadhaar_no
                ?? $request->aadhar
                ?? $request->aadhaar
                ?? $request->mobile_number
        ));

        if (! AadhaarReference::isValid($submittedAadhaar)) {
            return response()->json(['status' => false, 'message' => 'Enter a valid 12-digit Aadhar card number'], 422);
        }

        // Aadhaar can be on file in either the legacy plaintext column or the
        // newer encrypted one (set via setAadhaarNumber()/the Aadhaar export
        // flow) — prefer the encrypted value when present since that's the
        // one later-verified employees actually have populated.
        $onFileAadhaar = AadhaarReference::normalise(
            (string) ($emp->encrypted_aadhaar_number ?? $emp->getRawOriginal('aadhar_card_no'))
        );

        // SECURITY FIX: Never auto-accept a first-claim Aadhaar.
        // If no Aadhaar is on file, the employee cannot self-serve password reset.
        // They must contact their administrator to configure a recovery method.
        if ($onFileAadhaar === '') {
            return response()->json([
                'status' => false,
                'message' => 'No recovery method configured. Contact your administrator to set up password recovery.',
            ], 422);
        }

        if ($onFileAadhaar !== $submittedAadhaar) {
            return response()->json(['status' => false, 'message' => 'Details do not match our records'], 422);
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

    private function findUserByEmail(Request $request): ?User
    {
        return User::where('email', $request->email)->first();
    }

    private function sendPasswordResetOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        // A step-1 identity check (emp_code + Aadhaar, see verifyEmployeeIdentity)
        // may have just run and handed back a verification_token. That's what
        // lets a first-time employee with no email on file yet "claim" one
        // here, instead of the plain findUserByEmail() lookup below failing
        // with nothing to match against.
        $emp = null;
        if ($request->filled('emp_code') && $request->filled('verification_token')) {
            $emp = $this->findVerifiedEmployee($request);
            if ($emp && $emp->email !== $request->email) {
                $conflict = User::where('email', $request->email)->where('id', '!=', $emp->id)->first();
                if ($conflict) {
                    return response()->json(['status' => false, 'message' => 'This email is already registered to another account.'], 422);
                }
                $emp->email = $request->email;
                $emp->save();
            }
        }

        if (! $emp) {
            $emp = $this->findUserByEmail($request);
        }
        if (! $emp) {
            return response()->json(['status' => false, 'message' => 'Email not found in our records.'], 404);
        }

        $otp = (string) random_int(100000, 999999); // 6-digit OTP

        try {
            Mail::to($emp->email)->send(new PortalOtpMail($otp, $emp->name ?? 'there'));
        } catch (\Throwable $e) {
            Log::error('Failed to send OTP email: '.$e->getMessage());

            return response()->json(['status' => false, 'message' => 'Could not send OTP email. Please try again later.'], 500);
        }

        // Store OTP as hash with expiry and attempt counter (JSON in otp column)
        $otpData = [
            'hash' => Hash::make($otp),
            'expires_at' => now()->addMinutes(10)->toISOString(),
            'attempts' => 0,
            'verified' => false,
        ];
        $emp->otp = json_encode($otpData);
        $emp->save();

        return response()->json(['status' => true, 'message' => 'OTP sent to email']);
    }

    private function verifyPasswordResetOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'otp' => 'required|digits:6',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $emp = $this->findUserByEmail($request);
        if (! $emp || ! $emp->otp) {
            return response()->json(['status' => false, 'message' => 'Invalid OTP'], 422);
        }

        $otpData = json_decode($emp->otp, true);
        if (! $otpData || ! isset($otpData['hash'], $otpData['expires_at'], $otpData['attempts'])) {
            return response()->json(['status' => false, 'message' => 'Invalid OTP'], 422);
        }

        // Check expiry
        if (now()->greaterThan($otpData['expires_at'])) {
            return response()->json(['status' => false, 'message' => 'OTP expired. Please request a new one.'], 422);
        }

        // Check attempts
        if ($otpData['attempts'] >= 5) {
            return response()->json(['status' => false, 'message' => 'Too many attempts. Please request a new OTP.'], 422);
        }

        // Verify hash
        if (! Hash::check($request->otp, $otpData['hash'])) {
            $otpData['attempts']++;
            $emp->otp = json_encode($otpData);
            $emp->save();

            return response()->json(['status' => false, 'message' => 'Invalid OTP'], 422);
        }

        // Mark as verified
        $otpData['verified'] = true;
        $emp->otp = json_encode($otpData);
        $emp->save();

        return response()->json(['status' => true, 'message' => 'OTP verified']);
    }

    private function setNewPasswordAfterVerification(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'password' => 'required|min:8',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $emp = $this->findUserByEmail($request);
        if (! $emp || ! $emp->otp) {
            return response()->json(['status' => false, 'message' => 'Verification expired. Please request a new OTP.'], 422);
        }

        $otpData = json_decode($emp->otp, true);
        if (! $otpData || ! isset($otpData['verified']) || ! $otpData['verified']) {
            return response()->json(['status' => false, 'message' => 'OTP not verified. Please verify the OTP first.'], 422);
        }

        // Check expiry even for verified OTP
        if (isset($otpData['expires_at']) && now()->greaterThan($otpData['expires_at'])) {
            return response()->json(['status' => false, 'message' => 'Verification expired. Please request a new OTP.'], 422);
        }

        $emp->password = $request->password;
        $emp->otp = null;
        if ((int) $emp->status === 2) {
            $emp->status = 0;
        }
        $emp->save();

        return response()->json(['status' => true, 'message' => 'Password reset successfully']);
    }
}
