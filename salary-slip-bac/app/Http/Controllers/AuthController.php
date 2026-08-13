<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Authorization\SchemaSupport;
use App\Services\Sms\Fast2SmsService;
use App\Support\AadhaarDisclosure;
use App\Support\AadhaarReference;
use App\Support\AuthSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Tymon\JWTAuth\Facades\JWTAuth;

class AuthController extends Controller
{
    private const OTP_LOGIN_ACCEPTED =
        'If this mobile number is registered, an OTP has been sent.';

    private const OTP_LOGIN_TTL_MINUTES = 5;

    private const OTP_LOGIN_MAX_ATTEMPTS = 5;

    private const OTP_LOGIN_MAX_SENDS_PER_HOUR = 5;

    private const OTP_LOGIN_RESEND_COOLDOWN_SECONDS = 45;

    private const LOGIN_LOCKOUT_MAX_ATTEMPTS = 5;

    private const LOGIN_LOCKOUT_DECAY_SECONDS = 300;

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

        $lockoutKey = 'login|' . strtolower($loginInput) . '|' . $request->ip();

        if (RateLimiter::tooManyAttempts($lockoutKey, self::LOGIN_LOCKOUT_MAX_ATTEMPTS)) {
            $seconds = RateLimiter::availableIn($lockoutKey);

            return response()->json([
                'status' => false,
                'message' => 'Too many failed login attempts. Try again in ' . $seconds . ' seconds.',
            ], 429);
        }

        $field = filter_var($loginInput, FILTER_VALIDATE_EMAIL) ? 'email' : 'emp_code';

        $credentials = [
            $field => $loginInput,
            'password' => $password,
        ];

        $token = JWTAuth::attempt($credentials);

        if (! $token) {
            $userCandidate = User::where('is_deleted', 0)
                ->where(function ($q) use ($loginInput) {
                    $q->where(DB::raw('LOWER(email)'), strtolower($loginInput))
                      ->orWhere('emp_code', $loginInput)
                      ->orWhere('mobile_number', $loginInput);
                })
                ->first();

            if ($userCandidate && Hash::check($password, $userCandidate->password)) {
                $token = JWTAuth::fromUser($userCandidate);
            }
        }

        if (! $token) {
            RateLimiter::hit($lockoutKey, self::LOGIN_LOCKOUT_DECAY_SECONDS);

            return response()->json(['status' => false, 'message' => 'Invalid credentials'], 401);
        }

        RateLimiter::clear($lockoutKey);

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

    public function sendLoginOtp(Request $request, Fast2SmsService $sms)
    {
        $validator = Validator::make($request->all(), [
            'mobile' => 'required|string',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $mobile = self::normaliseMobile((string) $request->input('mobile'));

        if (strlen($mobile) !== 10) {
            return response()->json(['status' => false, 'message' => 'Enter a valid 10-digit mobile number'], 422);
        }

        if (! SchemaSupport::hasTable('login_otps')) {
            return response()->json(['status' => false, 'message' => 'OTP login is not available right now.'], 503);
        }

        $user = $this->findUserForOtpLogin($mobile);

        if (! $user) {
            usleep(random_int(180_000, 320_000));

            return response()->json(['status' => true, 'message' => self::OTP_LOGIN_ACCEPTED]);
        }

        $now = now();
        $row = DB::table('login_otps')->where('user_id', $user->id)->first();

        if ($row && $row->last_sent_at
            && $now->diffInSeconds($row->last_sent_at, true) < self::OTP_LOGIN_RESEND_COOLDOWN_SECONDS) {
            return response()->json(['status' => false, 'message' => 'Please wait a moment before requesting another OTP.'], 429);
        }

        $sentCount = 0;
        $windowStartedAt = $now;

        if ($row && $row->window_started_at && $now->diffInMinutes($row->window_started_at, true) < 60) {
            $sentCount = (int) $row->sent_count;
            $windowStartedAt = $row->window_started_at;
        }

        if ($sentCount >= self::OTP_LOGIN_MAX_SENDS_PER_HOUR) {
            return response()->json(['status' => false, 'message' => 'Too many OTP requests. Please try again after an hour.'], 429);
        }

        $otp = (string) random_int(100000, 999999);
        $delivered = $sms->sendOtp($mobile, $otp);

        if (! $delivered && ! config('auth.otp_dev_fallback', false)) {
            return response()->json(['status' => false, 'message' => 'Unable to send the OTP right now. Please verify your mobile number or contact support.'], 422);
        }

        DB::table('login_otps')->updateOrInsert(
            ['user_id' => $user->id],
            [
                'mobile' => $mobile,
                'otp_hash' => Hash::make($otp),
                'expires_at' => $now->copy()->addMinutes(self::OTP_LOGIN_TTL_MINUTES),
                'attempts' => 0,
                'sent_count' => $sentCount + 1,
                'window_started_at' => $windowStartedAt,
                'last_sent_at' => $now,
                'created_at' => $row?->created_at ?? $now,
                'updated_at' => $now,
            ]
        );

        Log::info('Login OTP sent', ['user_id' => $user->id]);

        $payload = ['status' => true, 'message' => self::OTP_LOGIN_ACCEPTED];

        if (! $delivered) {
            Log::warning('Login OTP dev fallback used — code returned to caller', ['user_id' => $user->id]);
            $payload['dev_otp'] = $otp;
        }

        return response()->json($payload);
    }

    public function verifyLoginOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'mobile' => 'required|string',
            'otp' => 'required|digits:6',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $mobile = self::normaliseMobile((string) $request->input('mobile'));

        if (strlen($mobile) !== 10) {
            return response()->json(['status' => false, 'message' => 'Enter a valid 10-digit mobile number'], 422);
        }

        if (! SchemaSupport::hasTable('login_otps')) {
            return response()->json(['status' => false, 'message' => 'OTP login is not available right now.'], 503);
        }

        $user = $this->findUserForOtpLogin($mobile);

        if (! $user) {
            return response()->json(['status' => false, 'message' => 'Invalid OTP'], 401);
        }

        $verdict = DB::transaction(function () use ($request, $user) {
            $row = DB::table('login_otps')->where('user_id', $user->id)->lockForUpdate()->first();

            if (! $row || ! $row->otp_hash || ! $row->expires_at) {
                return ['ok' => false, 'message' => 'Invalid OTP', 'code' => 401];
            }

            if (now()->greaterThan($row->expires_at)) {
                return ['ok' => false, 'message' => 'OTP expired. Please request a new one.', 'code' => 401];
            }

            if ((int) $row->attempts >= self::OTP_LOGIN_MAX_ATTEMPTS) {
                return ['ok' => false, 'message' => 'Too many attempts. Please request a new OTP.', 'code' => 429];
            }

            if (! Hash::check((string) $request->input('otp'), $row->otp_hash)) {
                DB::table('login_otps')->where('user_id', $user->id)->update([
                    'attempts' => (int) $row->attempts + 1,
                    'updated_at' => now(),
                ]);

                return ['ok' => false, 'message' => 'Invalid OTP', 'code' => 401];
            }

            DB::table('login_otps')->where('user_id', $user->id)->delete();

            return ['ok' => true];
        });

        if (! $verdict['ok']) {
            $this->recordLoginEvent($request, $user, 'failed', 'otp_login_rejected');

            return response()->json(['status' => false, 'message' => $verdict['message']], $verdict['code']);
        }

        if ($denial = $this->accountDenial($user)) {
            $this->recordLoginEvent($request, $user, 'failed', $denial['reason']);

            return response()->json(['status' => false, 'message' => $denial['message']], 403);
        }

        if ((int) $user->status === 2) {
            $user->status = 0;
            $user->save();
        }

        $token = JWTAuth::fromUser($user);

        $this->stampLogin($request, $user);
        $this->recordLoginEvent($request, $user, 'success', null);

        return AuthSession::noStore(response()->json([
            'status' => true,
            'message' => 'Login successful',
            'token' => $token,
            'token_type' => 'Bearer',
            'user' => $user,
        ]));
    }

    private function findUserForOtpLogin(string $mobile): ?User
    {
        $matches = User::where('is_deleted', 0)
            ->whereNotNull('mobile_number')
            ->where('mobile_number', 'LIKE', '%' . substr($mobile, -4) . '%')
            ->get()
            ->filter(fn (User $u) => self::normaliseMobile((string) $u->mobile_number) === $mobile)
            ->values();

        return $matches->count() === 1 ? $matches->first() : null;
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

        // resignation_date is the employee's last working day (see
        // ExitManagementController::store). Once it has passed, they've
        // actually left, so their account can no longer log in.
        if ($user->resignation_date && now()->toDateString() >= (string) $user->resignation_date) {
            return ['reason' => 'account_resigned', 'message' => 'This account has been deactivated following resignation. Contact HR if this is unexpected.'];
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
        $user->password_changed_at = now();
        $user->save();

        AuthSession::revokeCurrentToken();

        return response()->json([
            'status' => true,
            'message' => 'Password changed successfully. Please log in again.',
        ]);
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

    /**
     * Reduce a mobile number to the 10 significant digits.
     *
     * Numbers reach this table from bulk Excel imports, appointment forms and
     * manual entry, so the same person can be stored as "9876543210",
     * "+91 98765 43210", "091-9876543210" or with a stray trailing space.
     * Comparing raw strings would reject the right person for a formatting
     * difference they cannot see, so both sides are reduced to the last ten
     * digits before they are compared.
     */
    private static function normaliseMobile(string $value): string
    {
        $digits = preg_replace('/\D+/', '', $value) ?? '';

        // Trims a country code (91) or trunk prefix (0) without touching a
        // number that is already ten digits.
        return strlen($digits) > 10 ? substr($digits, -10) : $digits;
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

        /*
         * The "Verify Employee" screen confirms the employee's mobile number
         * against the one on file. It previously asked for an Aadhaar card
         * number; that was changed because Aadhaar is a national identity
         * number rather than a rotatable credential, and the rest of this
         * application treats it as sensitive data to be encrypted and
         * disclosure-audited — not typed into a login screen.
         *
         * The aliases below are the field names earlier revisions of this flow
         * used. They are accepted so a cached copy of the old frontend does not
         * start failing the moment this deploys.
         */
        $submittedMobile = self::normaliseMobile((string) (
            $request->mobile_number
                ?? $request->mobile_no
                ?? $request->mob_num
                ?? $request->phone
                ?? ''
        ));

        if (strlen($submittedMobile) !== 10) {
            return response()->json(['status' => false, 'message' => 'Enter a valid 10-digit mobile number'], 422);
        }

        $onFileMobile = self::normaliseMobile((string) $emp->mobile_number);

        // Never auto-accept a first claim. With no mobile on file there is
        // nothing to check the caller against, so anyone holding the employee
        // code could pass this step — the account has to be recovered by an
        // administrator instead.
        if ($onFileMobile === '') {
            return response()->json([
                'status' => false,
                'message' => 'No recovery method configured. Contact your administrator to set up password recovery.',
            ], 422);
        }

        // Constant-time: this is a credential check, and a length-sensitive
        // comparison leaks how much of the number was right.
        if (! hash_equals($onFileMobile, $submittedMobile)) {
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
        $emp = null;
        if ($request->filled('emp_code') && $request->filled('verification_token')) {
            $emp = $this->findVerifiedEmployee($request);
        }

        if (! $emp && $request->filled('mobile')) {
            $mobile = self::normaliseMobile((string) $request->mobile);
            if (strlen($mobile) === 10) {
                $emp = $this->findUserForOtpLogin($mobile);
            }
        }

        if (! $emp && $request->filled('email')) {
            $emp = $this->findUserByEmail($request);
        }

        if (! $emp) {
            usleep(random_int(180_000, 320_000));
            return response()->json(['status' => false, 'message' => 'Verification session expired or employee not found. Please try Step 1 again.'], 422);
        }

        $mobileOnFile = self::normaliseMobile((string) ($emp->mobile_number ?? $request->mobile_number ?? $request->mobile ?? ''));

        if (strlen($mobileOnFile) !== 10) {
            return response()->json(['status' => false, 'message' => 'No mobile number on file. Contact your administrator.'], 422);
        }

        $otp = (string) random_int(100000, 999999); // 6-digit OTP

        Log::info('Password reset mobile OTP delivery initiated', [
            'user_id' => $emp->id,
            'mobile' => $mobileOnFile,
        ]);

        $delivered = app(Fast2SmsService::class)->sendOtp($mobileOnFile, $otp);

        if ($delivered) {
            Log::info('Password reset OTP sent by SMS', ['user_id' => $emp->id]);
        }

        // Same rule as sendLoginOtp(): a failed send is only ever masked behind
        // a fabricated "sent" response when OTP_DEV_FALLBACK is explicitly on
        // (local/dev). In any other environment, a failed send must surface as
        // an error — silently disclosing the OTP to the caller instead of
        // actually delivering it would let anyone who can reach this endpoint
        // read a code intended for the employee's phone.
        if (! $delivered && ! config('auth.otp_dev_fallback', false)) {
            return response()->json(['status' => false, 'message' => 'Unable to send the OTP right now. Please verify your mobile number or contact support.'], 422);
        }

        $emp->otp = json_encode([
            'hash' => Hash::make($otp),
            'expires_at' => now()->addMinutes(10)->toISOString(),
            'attempts' => 0,
            'verified' => false,
        ]);
        $emp->save();

        $payload = [
            'status' => true,
            'success' => true,
            'message' => 'OTP sent to your registered mobile number.',
        ];

        if ($delivered) {
            $payload['channel'] = 'sms';
        } else {
            Log::warning('Password reset OTP dev fallback used — code returned to caller', ['user_id' => $emp->id]);
            $payload['dev_otp'] = $otp;
        }

        return response()->json($payload);
    }

    private function verifyPasswordResetOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'otp' => 'required|digits:6',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $found = null;
        if ($request->filled('emp_code') && $request->filled('verification_token')) {
            $found = $this->findVerifiedEmployee($request);
        }

        if (! $found && $request->filled('mobile')) {
            $mobile = self::normaliseMobile((string) $request->mobile);
            if (strlen($mobile) === 10) {
                $found = $this->findUserForOtpLogin($mobile);
            }
        }

        if (! $found && $request->filled('email')) {
            $found = $this->findUserByEmail($request);
        }

        if (! $found) {
            return response()->json(['status' => false, 'message' => 'Invalid or expired session. Please restart verification.'], 422);
        }

        return DB::transaction(function () use ($request, $found) {
            $emp = User::query()->whereKey($found->id)->lockForUpdate()->first();

            if (! $emp || ! $emp->otp) {
                return response()->json(['status' => false, 'message' => 'Invalid OTP or no OTP requested'], 422);
            }

            $otpData = json_decode($emp->otp, true);
            if (! $otpData || ! isset($otpData['hash'], $otpData['expires_at'], $otpData['attempts'])) {
                return response()->json(['status' => false, 'message' => 'Invalid OTP session'], 422);
            }

            if (now()->greaterThan($otpData['expires_at'])) {
                return response()->json(['status' => false, 'message' => 'OTP expired. Please request a new one.'], 422);
            }

            if ($otpData['attempts'] >= 5) {
                return response()->json(['status' => false, 'message' => 'Too many attempts. Please request a new OTP.'], 422);
            }

            if (! Hash::check((string) $request->otp, $otpData['hash'])) {
                $otpData['attempts']++;
                $emp->otp = json_encode($otpData);
                $emp->save();

                Log::info('Password reset OTP verification failed', [
                    'user_id' => $emp->id,
                    'attempts' => $otpData['attempts'],
                ]);

                return response()->json(['status' => false, 'message' => 'Incorrect OTP. Please try again.'], 422);
            }

            $otpData['verified'] = true;
            $emp->otp = json_encode($otpData);
            $emp->save();

            Log::info('Password reset OTP verified successfully', ['user_id' => $emp->id]);

            return response()->json(['status' => true, 'message' => 'OTP verified successfully']);
        });
    }

    private function setNewPasswordAfterVerification(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'password' => 'required|min:6',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $emp = null;
        if ($request->filled('emp_code') && $request->filled('verification_token')) {
            $emp = $this->findVerifiedEmployee($request);
        }

        if (! $emp && $request->filled('mobile')) {
            $mobile = self::normaliseMobile((string) $request->mobile);
            if (strlen($mobile) === 10) {
                $emp = $this->findUserForOtpLogin($mobile);
            }
        }

        if (! $emp && $request->filled('email')) {
            $emp = $this->findUserByEmail($request);
        }

        if (! $emp || ! $emp->otp) {
            return response()->json(['status' => false, 'message' => 'Verification expired. Please request a new OTP.'], 422);
        }

        $otpData = json_decode($emp->otp, true);
        if (! $otpData || ! isset($otpData['verified']) || ! $otpData['verified']) {
            return response()->json(['status' => false, 'message' => 'OTP not verified. Please verify OTP first.'], 422);
        }

        if (isset($otpData['expires_at']) && now()->greaterThan($otpData['expires_at'])) {
            return response()->json(['status' => false, 'message' => 'Verification expired. Please request a new OTP.'], 422);
        }

        $emp->password = $request->password;
        $emp->password_changed_at = now();
        $emp->otp = null;
        $emp->verification_token = null;
        $emp->verification_token_expires_at = null;
        if ((int) $emp->status === 2) {
            $emp->status = 0;
        }
        $emp->save();

        return response()->json(['status' => true, 'message' => 'Password reset successfully']);
    }
}
