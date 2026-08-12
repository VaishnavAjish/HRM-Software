<?php

namespace App\Http\Controllers;

use App\Mail\PortalOtpMail;
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
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Tymon\JWTAuth\Facades\JWTAuth;

class AuthController extends Controller
{
    /** Same reply for known and unknown addresses, so neither is disclosed. */
    private const RESET_REQUEST_ACCEPTED =
        'If an account exists for this email, a verification code has been sent.';

    private const OTP_MAIL_ATTEMPTS = 3;

    private const OTP_LOGIN_ACCEPTED =
        'If this mobile number is registered, an OTP has been sent.';

    private const OTP_LOGIN_TTL_MINUTES = 5;

    private const OTP_LOGIN_MAX_ATTEMPTS = 5;

    private const OTP_LOGIN_MAX_SENDS_PER_HOUR = 5;

    private const OTP_LOGIN_RESEND_COOLDOWN_SECONDS = 45;

    /** Keep the provider's reason, drop anything that looks like a credential. */
    private static function scrubTransportError(string $message): string
    {
        $message = preg_replace('/\S+@\S+/', '<address>', $message) ?? $message;
        $message = preg_replace('/(?<=password|passwd|pwd)\s*\S+/i', ' <redacted>', $message) ?? $message;
        $message = preg_replace('/\s+/', ' ', $message) ?? $message;

        return mb_substr(trim($message), 0, 300);
    }

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
            return response()->json(['status' => false, 'message' => 'Unable to send the OTP right now. Please try again.'], 500);
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
            // The hashing and SMTP round-trip take real time. Returning
            // instantly here would make the timing itself the disclosure.
            usleep(random_int(180_000, 320_000));

            return response()->json(['status' => true, 'success' => true, 'message' => self::RESET_REQUEST_ACCEPTED]);
        }

        $otp = (string) random_int(100000, 999999); // 6-digit OTP

        // The code itself is never logged. It is a single-use credential that
        // resets an account, so writing it to a file that operators, backups and
        // log shippers can all read turns the log into a password store.
        Log::info('Password reset OTP delivery initiated', [
            'user_id' => $emp->id,
            'email' => self::maskEmail($emp->email),
        ]);

        /*
         * Retried, because the provider throttles rather than fails outright.
         *
         * GoDaddy's relay answered a burst of sends with a temporary rejection:
         * three attempts inside two minutes were refused, then the same message
         * to the same address went out moments later. One try turned that into a
         * hard 500 and an employee who could not reset their password, so a
         * transient refusal is retried before it becomes the user's problem.
         */
        $sent = false;
        $lastError = null;
        $used = 0;

        for ($attempt = 1; $attempt <= self::OTP_MAIL_ATTEMPTS; $attempt++) {
            $used = $attempt;

            try {
                Mail::to($emp->email)->send(new PortalOtpMail($otp, $emp->name ?? 'there'));
                $sent = true;
                break;
            } catch (\Throwable $e) {
                $lastError = $e;

                if ($attempt < self::OTP_MAIL_ATTEMPTS) {
                    usleep($attempt * 400000);
                }
            }
        }

        if (! $sent) {
            // The provider's refusal text is what separates throttling from a bad
            // credential, so it is kept — scrubbed of anything resembling the
            // account it authenticated with, and truncated.
            Log::error('Password reset OTP delivery failed', [
                'user_id' => $emp->id,
                'attempts' => $used,
                'exception' => $lastError::class,
                'reason' => self::scrubTransportError($lastError->getMessage()),
            ]);

            /*
             * The development fallback, behind an explicit opt-in.
             *
             * It previously triggered on APP_ENV=local alone and did two things
             * that cannot be allowed near real users: it wrote the code to the
             * log in cleartext, and it returned the code in the API response.
             * The reset endpoint is deliberately enumeration-safe, so anyone who
             * could reach it could post any address and be handed that account's
             * reset code — takeover of any account, no credentials needed. This
             * deployment runs APP_ENV=local and serves the LAN, so it was live.
             *
             * It now requires OTP_DEV_FALLBACK=true, absent by default, and the
             * code is never logged. A developer who wants it opts in on their own
             * machine; nobody enables it by accident.
             */
            if (config('auth.otp_dev_fallback', false)) {
                Log::warning('Password reset OTP dev fallback used — code returned to caller', [
                    'user_id' => $emp->id,
                ]);

                $emp->otp = json_encode([
                    'hash' => Hash::make($otp),
                    'expires_at' => now()->addMinutes(10)->toISOString(),
                    'attempts' => 0,
                    'verified' => false,
                ]);
                $emp->save();

                return response()->json([
                    'status' => true,
                    'success' => true,
                    'message' => self::RESET_REQUEST_ACCEPTED,
                    'dev_otp' => $otp,
                ]);
            }

            return response()->json([
                'status' => false,
                'success' => false,
                'message' => 'Unable to send the verification email right now. Please try again.',
            ], 500);
        }

        Log::info('Password reset OTP mail submitted', [
            'user_id' => $emp->id,
            'attempts' => $used,
        ]);

        // Store OTP as hash with expiry and attempt counter (JSON in otp column)
        $otpData = [
            'hash' => Hash::make($otp),
            'expires_at' => now()->addMinutes(10)->toISOString(),
            'attempts' => 0,
            'verified' => false,
        ];
        $emp->otp = json_encode($otpData);
        $emp->save();

        // Identical to the unknown-address reply above, deliberately.
        return response()->json(['status' => true, 'success' => true, 'message' => self::RESET_REQUEST_ACCEPTED]);
    }

    /** p***@example.com — enough to correlate a report, not enough to harvest. */
    private static function maskEmail(?string $email): string
    {
        $email = (string) $email;
        $at = strpos($email, '@');

        if ($at === false || $at === 0) {
            return '***';
        }

        return substr($email, 0, 1) . '***' . substr($email, $at);
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

        $found = $this->findUserByEmail($request);
        if (! $found) {
            return response()->json(['status' => false, 'message' => 'Invalid OTP'], 422);
        }

        /*
         * The challenge row is read and written under a row lock.
         *
         * Reading the JSON, incrementing `attempts` and writing it back is a
         * read-modify-write: two wrong guesses arriving together both read the
         * same counter and both store the same increment, so the fifth attempt
         * never arrives and the five-guess ceiling stops bounding anything. The
         * lock also makes verification single-use under concurrency, so the same
         * code cannot be redeemed twice in parallel.
         */
        return DB::transaction(function () use ($request, $found) {
            $emp = User::query()->whereKey($found->id)->lockForUpdate()->first();

            if (! $emp || ! $emp->otp) {
                return response()->json(['status' => false, 'message' => 'Invalid OTP'], 422);
            }

            $otpData = json_decode($emp->otp, true);
            if (! $otpData || ! isset($otpData['hash'], $otpData['expires_at'], $otpData['attempts'])) {
                return response()->json(['status' => false, 'message' => 'Invalid OTP'], 422);
            }

            if (now()->greaterThan($otpData['expires_at'])) {
                return response()->json(['status' => false, 'message' => 'OTP expired. Please request a new one.'], 422);
            }

            if ($otpData['attempts'] >= 5) {
                return response()->json(['status' => false, 'message' => 'Too many attempts. Please request a new OTP.'], 422);
            }

            if (! Hash::check($request->otp, $otpData['hash'])) {
                $otpData['attempts']++;
                $emp->otp = json_encode($otpData);
                $emp->save();

                Log::info('Password reset OTP verification failed', [
                    'user_id' => $emp->id,
                    'attempts' => $otpData['attempts'],
                ]);

                return response()->json(['status' => false, 'message' => 'Invalid OTP'], 422);
            }

            $otpData['verified'] = true;
            $emp->otp = json_encode($otpData);
            $emp->save();

            Log::info('Password reset OTP verified', ['user_id' => $emp->id]);

            return response()->json(['status' => true, 'message' => 'OTP verified']);
        });
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
