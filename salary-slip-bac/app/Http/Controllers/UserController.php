<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\SalarySlip;
use App\Models\UploadBatch;
use App\Exceptions\DocumentException;
use App\Services\DocumentStorageService;
use App\Services\Documents\DocumentService;
use App\Support\AadhaarReference;
use App\Support\AuditLogger;
use App\Support\DocumentType;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Maatwebsite\Excel\Facades\Excel;
use RuntimeException;

class UserController extends Controller
{
    // Fields an appointment/trial-form submission (or an admin/agent editing
    // one) is allowed to write. Deliberately excludes role, is_deleted, type,
    // added_by, password, processed — those are only ever set by server-side
    // logic below, never taken directly from request input.
    private const APPOINTMENT_FIELDS = [
        'emp_code', 'joining_date', 'department', 'designation', 'manager_name', 'salary',
        'mobile_number', 'emp_whatsapp_no', 'punching_no', 'name', 'email', 'address',
        'village', 'taluka', 'district', 'dob', 'birth_place', 'gender', 'cast',
        'marital_status', 'blood_group', 'reference_name', 'reference_mobile_no',
        'aadhar_card_no', 'bank_name', 'pan_card_no', 'bank_ifsc_code', 'education',
        'bank_account_no', 'company_code', 'unit', 'emp_signature', 'members',
        'photo', 'adhar_image', 'pan_image', 'check_image', 'account_book',
    ];

    // Fields a logged-in user may change on their own profile via /profile-update.
    // Intentionally excludes role, company_code, unit, emp_code, is_deleted,
    // salary, bank/tax details — none of that should be self-service.
    private const SELF_PROFILE_FIELDS = [
        'name', 'email', 'mobile_number', 'dob', 'address', 'photo',
        'city', 'district', 'state', 'pin',
        'aadhar_card_no', 'pan_card_no', 'bank_name', 'bank_ifsc_code', 
        'bank_account_no', 'pf_no', 'esi_no',
        'gender', 'department', 'designation', 'joining_date'
    ];

    /**
     * Largest upload we accept, in kilobytes.
     *
     * Derived from documents.max_file_size but capped by PHP's own
     * upload_max_filesize — a rule looser than php.ini is a lie, because PHP
     * discards the file before Laravel ever validates it.
     */
    private function maxUploadKb(): int
    {
        $configured = (int) (config('documents.max_file_size') / 1024);
        $phpLimit = (int) (self::iniBytes(ini_get('upload_max_filesize')) / 1024);

        return $phpLimit > 0 ? min($configured, $phpLimit) : $configured;
    }

    /** "2M" / "8M" / "512K" -> bytes */
    private static function iniBytes(?string $value): int
    {
        $value = trim((string) $value);

        if ($value === '') {
            return 0;
        }

        $number = (int) $value;

        return match (strtolower(substr($value, -1))) {
            'g' => $number * 1024 * 1024 * 1024,
            'm' => $number * 1024 * 1024,
            'k' => $number * 1024,
            default => $number,
        };
    }

    private function photoUploadRules(): array
    {
        return ['photo' => 'nullable|image|mimes:jpeg,jpg,png,webp|max:' . $this->maxUploadKb()];
    }

    /** Scanned ID documents — unlike photo these may also be PDFs. */
    private function documentUploadRules(): array
    {
        $max = $this->maxUploadKb();
        $rule = 'nullable|file|mimes:jpeg,jpg,png,webp,pdf|max:' . $max;

        return [
            'adhar_image'  => $rule,
            'pan_image'    => $rule,
            'check_image'  => $rule,
            'account_book' => $rule,
        ];
    }

    /**
     * PHP silently discards the whole request body — every field and every file
     * — when the upload exceeds post_max_size. Laravel then sees an empty POST
     * and reports missing fields the user definitely filled in, which is
     * impossible to diagnose from the UI. Detect it and say what happened.
     */
    private function assertPostNotTruncated(Request $request): void
    {
        $contentLength = (int) $request->server('CONTENT_LENGTH', 0);
        $postMax = self::iniBytes(ini_get('post_max_size'));

        if ($postMax > 0 && $contentLength > $postMax && empty($request->all()) && empty($request->allFiles())) {
            throw ValidationException::withMessages([
                'files' => 'The upload was too large for the server to accept (limit '
                    . round($postMax / 1048576, 1) . ' MB in total). Please upload smaller files.',
            ]);
        }
    }

    // Every request field that arrives as an uploaded file. These must never
    // reach a mass-assignment array as raw input — see storeUploadedFiles().
    private const FILE_UPLOAD_FIELDS = ['photo', 'adhar_image', 'pan_image', 'check_image', 'account_book'];

    /**
     * Who the uploaded documents belong to.
     *
     * On a brand-new appointment the users row does not exist yet, so fall back
     * to an unsaved User carrying the submitted emp_code/name. That is enough
     * for the filename and folder to be correct; the metadata row simply has a
     * null user_id and is still findable by emp_code.
     */
    private function resolveDocumentOwner(Request $request): User
    {
        if ($request->filled('id') && ($found = User::find($request->input('id')))) {
            return $found;
        }

        if ($request->filled('emp_code') && ($found = User::where('emp_code', $request->input('emp_code'))->first())) {
            return $found;
        }

        // The appointment form posts name as {first, mid, surname}.
        $name = $request->input('name');

        if (is_string($name) && str_starts_with(trim($name), '{')) {
            $name = json_decode($name, true) ?: $name;
        }

        if (is_array($name)) {
            $name = trim(implode(' ', array_filter([$name['first'] ?? null, $name['mid'] ?? null, $name['surname'] ?? null])));
        }

        // No users row and no employee code yet. Falling through with a null
        // code would put every such person in the same employees/USR000000
        // folder and, because versions are numbered per owner, make one
        // person's upload look like V2 of another's. Derive a stable per-person
        // reference from whatever identity the form did supply.
        // Aadhaar is carried through so the folder is <Aadhaar>_<EmpCode> even on
        // a first submission; the PENDING fallback only applies when neither
        // identifier is available.
        $aadhaar = $request->input('aadhar_card_no');
        $empCode = $request->input('emp_code');

        return new User([
            'aadhar_card_no' => $aadhaar,
            'emp_code'       => $empCode ?: ($aadhaar ? null : $this->pendingOwnerRef($request)),
            'name'           => $name ?: null,
        ]);
    }

    /**
     * Decide what an incoming aadhar_card_no may do to the stored value.
     *
     * The column is hidden from every API response (see User::$hidden), so an
     * edit form has nothing to repopulate the input with and posts it back
     * empty — or, if a UI shows the mask, as "XXXX XXXX 9012". Writing either
     * one erases the stored number, and with it the S3 folder reference derived
     * from it, so a record silently loses the link to its own documents.
     *
     * Only a complete, valid 12-digit number may replace what is already there.
     * Anything shorter is treated as "unchanged" and dropped from the payload.
     */
    private function withSafeAadhaar(array $data): array
    {
        if (!array_key_exists('aadhar_card_no', $data)) {
            return $data;
        }

        $incoming = $data['aadhar_card_no'];

        // Scalar-only: an array or object here is malformed input, never a number.
        $digits = is_scalar($incoming) ? AadhaarReference::normalise((string) $incoming) : '';

        if (!AadhaarReference::isValid($digits)) {
            unset($data['aadhar_card_no']);

            return $data;
        }

        // Store digits only, so "1234 5678 9012" and "123456789012" produce the
        // same folder reference.
        $data['aadhar_card_no'] = $digits;

        return $data;
    }

    /**
     * Write $data onto $target, noting any Aadhaar change on the way through.
     *
     * Every appointment/employee update goes through here so the audit cannot be
     * forgotten at one call site while the others have it.
     */
    private function applyUpdate(User $target, array $data): void
    {
        if (isset($data['aadhar_card_no'])) {
            $this->recordAadhaarChange($target, (string) $data['aadhar_card_no']);
        }

        $target->update($data);
    }

    /**
     * Note that an Aadhaar was set or replaced. Last four digits only — the
     * complete number must never reach a log file, so the previous value is
     * recorded as presence plus its own last four rather than as a value.
     */
    private function recordAadhaarChange(User $employee, string $newDigits): void
    {
        $previous = $employee->getRawOriginal('aadhar_card_no');

        if (AadhaarReference::normalise((string) $previous) === $newDigits) {
            return;
        }

        \Illuminate\Support\Facades\Log::info('aadhaar.changed', [
            'record_id' => $employee->id,
            'record_type' => $employee->type ?: 'employee',
            'actor_id' => auth('api')->id(),
            'action' => $previous ? 'replaced' : 'added',
            'previous_present' => (bool) $previous,
            'previous_last4' => AadhaarReference::lastFour((string) $previous) ?: null,
            'new_last4' => substr($newDigits, -4),
            'at' => now()->toIso8601String(),
        ]);
    }

    /**
     * Deterministic placeholder reference for an employee who has no code yet.
     *
     * Same person (same Aadhaar/email/mobile) resolves to the same folder on a
     * resubmission; different people never share one. Replaced by the real
     * emp_code once the appointment is approved and the documents are migrated.
     */
    private function pendingOwnerRef(Request $request): string
    {
        $seed = $request->input('aadhar_card_no')
            ?: $request->input('email')
            ?: $request->input('mobile_number')
            ?: $request->input('punching_no');

        if (!$seed) {
            // Nothing identifying at all — keep this submission's files together
            // without colliding with anyone else's.
            $seed = json_encode($request->except(self::FILE_UPLOAD_FIELDS)) . microtime(true);
        }

        return 'PENDING' . strtoupper(substr(sha1((string) $seed), 0, 10));
    }

    /**
     * Move uploaded photo/document files out of PHP's temp directory and return
     * the relative paths to persist, keyed by field name.
     *
     * Without this the UploadedFile instance is mass-assigned straight into the
     * model, where it stringifies to PHP's temp path (…/Temp/phpXXXX.tmp). That
     * path is written to the database and later rendered by the browser as
     * `file:///…`, which Chrome refuses to load ("Not allowed to load local
     * resource") — and the temp file is deleted when the request ends anyway,
     * so the upload is lost either way.
     *
     * $allowedFields is the caller's field allowlist, so a file cannot be
     * stored for a field that endpoint would not otherwise let you write.
     */
    private function storeUploadedFiles(Request $request, array $allowedFields, ?User $owner = null): array
    {
        $stored = [];
        $uploadedBy = optional(auth('api')->user())->id;

        foreach (array_intersect(self::FILE_UPLOAD_FIELDS, $allowedFields) as $field) {
            if (!$request->hasFile($field)) {
                continue;
            }

            $file = $request->file($field);
            $documentType = DocumentType::LEGACY_FIELD_MAP[$field] ?? 'OTHER';

            try {
                if (config('documents.provider') === 's3') {
                    // Photos and ID documents go to the private S3 bucket with
                    // versioning, checksums and an audit trail. The column keeps
                    // the object key; User::photo_url presigns it for display.
                    $version = DocumentService::make()->upload(
                        $file,
                        $owner ?? $request->user(),
                        $documentType,
                        $uploadedBy
                    );
                    $stored[$field] = $version->s3_object_key;
                } else {
                    $document = DocumentStorageService::store($file, $owner, $documentType, $uploadedBy);
                    $stored[$field] = $document->storage_path;
                }
            } catch (DocumentException $e) {
                throw ValidationException::withMessages([$field => $e->getMessage()]);
            } catch (RuntimeException $e) {
                throw ValidationException::withMessages([$field => $e->getMessage()]);
            }
        }

        return $stored;
    }

    /**
     * True if $userAuth (a rawRole 1 "master" or 2 "manager") is allowed to
     * see/touch $employee under the same company/unit scoping index()/show()
     * already enforce for reads.
     */
    private function inManagedScope($userAuth, User $employee): bool
    {
        if (!$userAuth) {
            return true;
        }
        if ((int) $userAuth->role === 1) {
            return $employee->company_code === $userAuth->company_code;
        }
        if ((int) $userAuth->role === 2) {
            return $employee->company_code === $userAuth->company_code
                && $employee->unit === $userAuth->unit;
        }
        return true;
    }

    /**
     * Strips fields a non-super-admin must not be able to grant themselves or
     * anyone else through a plain field update: promotion to super admin
     * (role 0), and moving a record to a different company/unit than the
     * acting admin manages.
     */
    private function guardPrivilegedFields($userAuth, array $data): array
    {
        if (!$userAuth || (int) $userAuth->role === 0) {
            return $data;
        }

        if (array_key_exists('role', $data) && (int) $data['role'] === 0) {
            unset($data['role']);
        }
        if ((int) $userAuth->role === 1 && array_key_exists('company_code', $data)) {
            unset($data['company_code']);
        }
        if ((int) $userAuth->role === 2) {
            unset($data['company_code'], $data['unit']);
        }

        return $data;
    }

    public function index(Request $request)
    {
        $status = $request->status;
        $query = User::where('is_deleted', 0)
            ->whereNotIn('role', [0, 1, 2]);

        if ($status !== null && (int)$status === 2) {
            $query->where('type', 'pending_employee')
                ->where('status', 2);
        } else {
            $query->whereNotNull('emp_code')
                ->where('emp_code', '!=', '')
                ->where(function ($q) {
                    $q->whereNull('type')
                      ->orWhereNotIn('type', ['appointment', 'agent', 'pending_employee']);
                });
            if ($status !== null) {
                $query->where('status', $status);
            }
        }

        $userAuth = auth('api')->user();
        if ($userAuth && ((int) $userAuth->role === 1 || (int) $userAuth->role === 0)) {
            $requested = $request->company_code && !in_array($request->company_code, ['all', 'all-companies'])
                ? array_filter(array_map('trim', explode(',', $request->company_code)))
                : [];

            // Role 1 may narrow within its own companies but never outside them;
            // only role 0 is unscoped when no filter is supplied.
            $own = array_filter(array_map('trim', explode(',', (string) $userAuth->company_code)));
            $codes = (int) $userAuth->role === 0
                ? $requested
                : ($requested ? array_intersect($requested, $own) : $own);

            if ($codes) {
                $query->whereIn('company_code', $codes);
            } elseif ((int) $userAuth->role !== 0) {
                $query->whereRaw('1 = 0');
            }
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            if (!in_array('all', $codes) && !in_array('all-companies', $codes)) {
                $query->whereIn('company_code', $codes);
            }
        }
        if ($request->unit) {
            $query->where('unit', $request->unit);
        }
        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('name', 'like', "%{$request->search}%")
                  ->orWhere('emp_code', 'like', "%{$request->search}%")
                  ->orWhere('email', 'like', "%{$request->search}%");
            });
        }

        $total = (clone $query)->count();
        $activeCount = (clone $query)->where('status', 0)->count();
        $inactiveCount = $total - $activeCount;

        $perPage = $request->limit ?? 15;
        $employees = $query->orderBy('id', 'desc')->paginate($perPage);

        // The employee table shows the complete Aadhaar, so the paginated rows
        // carry it. Same reasoning as the appointment list: the query above is
        // already company- and unit-scoped, and only the current page's rows are
        // disclosed rather than the whole table.
        $disclosed = 0;

        $rows = collect($employees->items())->map(function (User $employee) use ($userAuth, &$disclosed) {
            $data = $employee->attributesToArray();

            $full = \App\Support\AadhaarDisclosure::fullFor($employee, $userAuth);

            if ($full !== null) {
                $data['aadhaar_full'] = $full;
                $disclosed++;
            }

            return $data;
        })->all();

        \App\Support\AadhaarDisclosure::auditListDisclosure(
            $userAuth,
            $disclosed,
            'EMPLOYEE_LIST_FULL_AADHAAR_DISCLOSED',
            ['page' => $employees->currentPage(), 'unit' => $request->unit]
        );

        return response()->json([
            'status' => true,
            'data'   => [
                'users' => [
                    'data'         => $rows,
                    'total'        => $employees->total(),
                    'per_page'     => $employees->perPage(),
                    'current_page' => $employees->currentPage(),
                    'last_page'    => $employees->lastPage(),
                ],
                'active_users'   => $activeCount,
                'inactive_users' => $inactiveCount,
            ],
        ]);
    }

    public function show($id, Request $request)
    {
        $employee = User::find($id);
        if (!$employee) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }
        
        $userAuth = auth('api')->user();
        if ($userAuth) {
            if ((int) $userAuth->role === 1 && $employee->company_code !== $userAuth->company_code) {
                return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
            }
            if ((int) $userAuth->role === 2 && ($employee->company_code !== $userAuth->company_code || $employee->unit !== $userAuth->unit)) {
                return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
            }
        }
        // Single-record details: disclose the full number to the owner or to any
        // actor allowed to reach the record. The scope checks above have already
        // turned an out-of-company request into a 404.
        $payload = \App\Support\AadhaarDisclosure::attach(
            $employee->toArray(),
            $employee,
            $userAuth,
            'EMPLOYEE_FULL_AADHAAR_VIEWED'
        );

        return response()->json(['status' => true, 'data' => $payload]);
    }

    public function store(Request $request)
    {
        // Creating an Admin (1) or Super Admin (0) account is a privilege
        // escalation — only an existing Super Admin may do it, and since
        // these accounts log in with email + password directly (no emp_code
        // self-claim flow), both must be supplied up front. Everyone else
        // hitting this endpoint is onboarding a regular employee/agent, which
        // stays unrestricted.
        $requestedRole = $request->input('role');
        $isPrivileged = in_array((int) $requestedRole, [0, 1], true);
        if ($isPrivileged) {
            $actingUser = auth('api')->user();
            if (!$actingUser || (int) $actingUser->role !== 0) {
                return response()->json(['status' => false, 'message' => 'Only a Super Admin can create Admin/Super Admin accounts'], 403);
            }
        }

        $validator = Validator::make($request->all(), [
            'name'     => 'required',
            'email'    => $isPrivileged ? 'required|email|unique:users' : 'nullable|email|unique:users',
            'password' => $isPrivileged ? 'required|min:6' : 'nullable',
            'emp_code' => 'nullable|unique:users',
            'company_code' => 'required',
            'unit'     => in_array($request->input('role'), [0, 1, 4, '0', '1', '4'], true) ? 'nullable' : 'required',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $data = $request->all();
        $data['password'] = $request->password ?? '12345678';
        $data['role'] = $request->role ?? 3;
        $data['emp_code'] = $request->emp_code ?: strtoupper(Str::random(8));
        // Normalise to digits, and never store a partial number.
        $data = $this->withSafeAadhaar($data);

        if (isset($data['aadhar_card_no'])) {
            $conflict = User::where('aadhar_card_no', $data['aadhar_card_no'])
                ->where('is_deleted', 0)
                ->first();
            if ($conflict) {
                return response()->json([
                    'status' => false,
                    'message' => "This Aadhaar number is already assigned to {$conflict->name}",
                ], 422);
            }
        }

        $employee = User::create($data);

        return response()->json(['status' => true, 'message' => 'Employee created', 'data' => $employee]);
    }

    public function update($id, Request $request)
    {
        $employee = User::find($id);
        if (!$employee) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        $userAuth = auth('api')->user();
        if (!$this->inManagedScope($userAuth, $employee)) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        $data = $this->guardPrivilegedFields($userAuth, $request->all());
        // The employee edit form cannot see the stored number either, so it
        // posts aadhar_card_no: null. Without this the first edit of any
        // employee erased their Aadhaar and detached them from their documents.
        $data = $this->withSafeAadhaar($data);
        if (isset($data['password'])) {
            $data['password'] = $data['password'];
        }

        if (isset($data['aadhar_card_no'])) {
            $aadhaarConflict = User::where('aadhar_card_no', $data['aadhar_card_no'])
                ->where('id', '!=', $employee->id)
                ->where('is_deleted', 0)
                ->first();
            if ($aadhaarConflict) {
                return response()->json([
                    'status' => false,
                    'message' => "This Aadhaar number is already assigned to {$aadhaarConflict->name}",
                ], 422);
            }
        }

        $newEmpCode = isset($data['emp_code']) ? trim((string) $data['emp_code']) : null;
        if ($newEmpCode && $employee->emp_code !== $newEmpCode) {
            $conflict = User::where('emp_code', $newEmpCode)
                ->where('id', '!=', $employee->id)
                ->where('is_deleted', 0)
                ->first();
            if ($conflict) {
                return response()->json([
                    'status' => false,
                    'message' => "Employee code '{$newEmpCode}' is already assigned to {$conflict->name}",
                ], 422);
            }
            if ($employee->type === 'appointment' || $employee->type === 'pending_employee') {
                $data['type'] = null;
            }
        }

        $this->applyUpdate($employee, $data);

        return response()->json(['status' => true, 'message' => 'Employee updated', 'data' => $employee]);
    }

    public function destroy($id, Request $request)
    {
        $employee = User::find($id);
        if (!$employee) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        if (!$this->inManagedScope(auth('api')->user(), $employee)) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        $this->deleteAudited($employee, $request);

        return response()->json(['status' => true, 'message' => 'Employee deleted']);
    }

    public function destroyMultiple(Request $request)
    {
        $ids = $request->input('ids', []);
        if (!is_array($ids) || empty($ids)) {
            return response()->json(['status' => false, 'message' => 'No IDs provided'], 400);
        }

        $user = auth('api')->user();
        $employees = User::whereIn('id', $ids)->get();

        $deletedCount = 0;
        foreach ($employees as $employee) {
            if ($this->inManagedScope($user, $employee)) {
                $this->deleteAudited($employee, $request);
                $deletedCount++;
            }
        }

        return response()->json([
            'status' => true,
            'message' => "{$deletedCount} employees deleted",
        ]);
    }

    /**
     * Delete a user and record that it happened, or do neither.
     *
     * User rows are deleted outright — there is no SoftDeletes trait, so once
     * the row is gone nothing anywhere says it existed. That is not theoretical:
     * production went from 339 users to 338 during an audit window, one of the
     * three role=1 admins, and audit_logs has no entry for it. The account
     * cannot be identified, attributed or restored.
     *
     * The audit write is inside the transaction on purpose, unlike
     * DocumentAudit::recordSafely, which is best-effort because it runs on
     * ordinary page loads where a broken audit table must not turn a working
     * screen into a 500. The trade-off inverts for a destructive, irreversible
     * action: if we cannot record that an account was deleted, we do not delete
     * it. Failing to delete is recoverable; deleting unrecorded is not.
     *
     * The snapshot holds what identifies the record and nothing sensitive — no
     * Aadhaar, no bank details, no password hash — because an audit trail is
     * read by more people than the record was.
     */
    private function deleteAudited(User $employee, Request $request): void
    {
        $snapshot = [
            'id'           => $employee->id,
            'name'         => $employee->name,
            'emp_code'     => $employee->emp_code,
            'email'        => $employee->email,
            'role'         => $employee->role,
            'company_code' => $employee->company_code,
            'unit'         => $employee->unit,
            'department'   => $employee->department,
            'type'         => $employee->type,
            'joining_date' => $employee->joining_date,
        ];

        DB::transaction(function () use ($employee, $request, $snapshot) {
            AuditLogger::log($request, 'DELETE', 'employees', $snapshot, null);
            $employee->delete();
        });
    }

    public function dashboard(Request $request)
    {
        $user = auth('api')->user();

        $slips = SalarySlip::where('emp_code', $user->emp_code);

        if ($request->company_code) {
            $codes = explode(',', $request->company_code);
            if (!in_array('all', $codes) && !in_array('all-companies', $codes)) {
                $slips->whereIn('company_code', $codes);
            }
        }

        return response()->json([
            'status' => true,
            'data'   => [
                'total_slips' => $slips->count(),
                'recent_slips'=> $slips->orderBy('id', 'desc')->take(5)->get(),
                'user'        => $user,
            ],
        ]);
    }

    public function importColumns()
    {
        // 'aliases' back the frontend's auto-suggest, matching an uploaded
        // sheet's header text to a database field on first inspection.
        $columns = [
            ['key' => 'emp_code', 'label' => 'Employee Code', 'required' => true, 'aliases' => ['code', 'employee code', 'emp code']],
            ['key' => 'name', 'label' => 'Full Name', 'required' => false, 'aliases' => ['employee name', 'full name']],
            ['key' => 'email', 'label' => 'Email', 'required' => false, 'aliases' => ['email address']],
            ['key' => 'mobile_number', 'label' => 'Mobile Number', 'required' => false, 'aliases' => ['mobile', 'phone']],
            ['key' => 'dob', 'label' => 'Date of Birth', 'required' => false, 'aliases' => ['date of birth', 'birth date']],
            ['key' => 'department', 'label' => 'Department', 'required' => false, 'aliases' => []],
            ['key' => 'designation', 'label' => 'Designation', 'required' => false, 'aliases' => []],
            ['key' => 'salary', 'label' => 'Salary', 'required' => false, 'aliases' => []],
            ['key' => 'joining_date', 'label' => 'Joining Date', 'required' => false, 'aliases' => ['date of joining']],
            ['key' => 'gender', 'label' => 'Gender', 'required' => false, 'aliases' => []],
            ['key' => 'bank_name', 'label' => 'Bank Name', 'required' => false, 'aliases' => []],
            ['key' => 'bank_account_no', 'label' => 'Bank Account No', 'required' => false, 'aliases' => ['account number', 'a/c number']],
            ['key' => 'bank_ifsc_code', 'label' => 'Bank IFSC Code', 'required' => false, 'aliases' => ['ifsc']],
            ['key' => 'aadhar_card_no', 'label' => 'Aadhar Card No', 'required' => false, 'aliases' => ['aadhar', 'aadhar number']],
            ['key' => 'pan_card_no', 'label' => 'PAN Card No', 'required' => false, 'aliases' => ['pan']],
            ['key' => 'pf_no', 'label' => 'PF Number', 'required' => false, 'aliases' => ['pf no.']],
            ['key' => 'esi_no', 'label' => 'ESI Number', 'required' => false, 'aliases' => ['esi no.']],
            ['key' => 'unit', 'label' => 'Branch/Unit', 'required' => false, 'aliases' => ['branch']],
            ['key' => 'company_code', 'label' => 'Company', 'required' => false, 'aliases' => ['company', 'company name', 'company code']],
        ];

        return response()->json(['status' => true, 'data' => $columns]);
    }

    // Bulk import rows can fail on a raw DB constraint (duplicate email,
    // duplicate emp_code, etc). Surfacing $e->getMessage() straight to the
    // upload report leaks the full SQL statement and bound params, so this
    // maps the common constraint violations to a message an admin can act on.
    private function friendlyImportError(\Throwable $e): string
    {
        $msg = $e->getMessage();
        if (stripos($msg, 'users.email') !== false || (stripos($msg, 'email') !== false && stripos($msg, 'unique') !== false)) {
            return 'Email address is already used by another employee';
        }
        if (stripos($msg, 'emp_code') !== false) {
            return 'Employee code already exists';
        }
        if (stripos($msg, 'Integrity constraint violation') !== false || stripos($msg, 'UNIQUE constraint failed') !== false) {
            return 'This row conflicts with an existing record';
        }
        return 'Could not save this row due to a database error';
    }

    private function parseImportDate($val): ?string
    {
        if (empty($val)) {
            return null;
        }

        if (is_numeric($val) && $val > 10000 && $val < 60000) {
            try {
                return \Carbon\Carbon::instance(\PhpOffice\PhpSpreadsheet\Shared\Date::excelToDateTimeObject($val))->toDateString();
            } catch (\Throwable $e) {
                // fallback
            }
        }

        $val = trim((string) $val);
        if ($val === '') {
            return null;
        }

        if (strpos($val, '1900') !== false || strpos($val, '00-00') !== false || $val === '00-01-1900') {
            return null;
        }

        $formats = [
            'd-m-Y',
            'd/m/Y',
            'j-n-Y',
            'j/n/Y',
            'Y-m-d',
            'Y/m/d',
        ];

        foreach ($formats as $fmt) {
            try {
                return \Carbon\Carbon::createFromFormat($fmt, $val)->toDateString();
            } catch (\Throwable $e) {
                // continue
            }
        }

        try {
            return \Carbon\Carbon::parse($val)->toDateString();
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function resolveCompanyFromUnit(?string $unit): ?string
    {
        if (empty($unit)) {
            return null;
        }
        $unit = strtolower(trim($unit));
        if (in_array($unit, ['daduk', 'dhaduk'], true)) {
            return 'silver-star';
        }
        if (in_array($unit, ['shreeji', 'shreeji building'], true)) {
            return 'nidhi-impex';
        }
        return null;
    }

    private function sanitizeRowData(array $rowData): array
    {
        // 1. Employee Code
        if (isset($rowData['emp_code'])) {
            $val = trim((string)$rowData['emp_code']);
            if (str_ends_with($val, '.0')) {
                $val = substr($val, 0, -2);
            }
            $rowData['emp_code'] = $val;
        }

        // 2. Mobile Number
        if (isset($rowData['mobile_number'])) {
            $val = trim((string)$rowData['mobile_number']);
            if (str_ends_with($val, '.0')) {
                $val = substr($val, 0, -2);
            }
            $rowData['mobile_number'] = preg_replace('/\D/', '', $val);
        }

        // 3. Email
        if (isset($rowData['email'])) {
            $email = strtolower(trim((string)$rowData['email']));
            if ($email === '0' || $email === '0.0' || $email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $rowData['email'] = null;
            } else {
                $rowData['email'] = $email;
            }
        }

        // 4. Aadhaar Card Number
        if (isset($rowData['aadhar_card_no'])) {
            $val = trim((string)$rowData['aadhar_card_no']);
            if (str_ends_with($val, '.0')) {
                $val = substr($val, 0, -2);
            }
            $rowData['aadhar_card_no'] = preg_replace('/\D/', '', $val);
        }

        // 5. PAN Card Number
        if (isset($rowData['pan_card_no'])) {
            $rowData['pan_card_no'] = strtoupper(preg_replace('/\s+/', '', (string)$rowData['pan_card_no']));
        }

        // 6. Bank Account No
        if (isset($rowData['bank_account_no'])) {
            $val = trim((string)$rowData['bank_account_no']);
            if (str_ends_with($val, '.0')) {
                $val = substr($val, 0, -2);
            }
            $rowData['bank_account_no'] = preg_replace('/\s+/', '', $val);
        }

        // 7. Bank IFSC Code
        if (isset($rowData['bank_ifsc_code'])) {
            $rowData['bank_ifsc_code'] = strtoupper(preg_replace('/\s+/', '', (string)$rowData['bank_ifsc_code']));
        }

        // 8. Gender
        if (isset($rowData['gender'])) {
            $gender = strtolower(trim((string)$rowData['gender']));
            if ($gender === 'm' || $gender === 'male') {
                $rowData['gender'] = 'Male';
            } elseif ($gender === 'f' || $gender === 'female') {
                $rowData['gender'] = 'Female';
            } elseif ($gender !== '') {
                $rowData['gender'] = ucfirst($gender);
            } else {
                $rowData['gender'] = null;
            }
        }

        // 9. Company Code
        $comp = null;
        if (isset($rowData['company_code'])) {
            $comp = strtolower(trim((string)$rowData['company_code']));
            $comp = str_replace(' ', '-', $comp);
            if (in_array($comp, ['silver', 'silverstar', 'silver-star', 'silver-star-jewels'], true)) {
                $comp = 'silver-star';
            } elseif (in_array($comp, ['nidhi', 'nidhiimpex', 'nidhi-impex', 'nidhi-impex-pvt-ltd'], true)) {
                $comp = 'nidhi-impex';
            } else {
                $comp = null;
            }
        }

        // 10. Unit
        $unitVal = null;
        if (isset($rowData['unit'])) {
            $unitVal = trim((string)$rowData['unit']);
            $lowerUnit = strtolower($unitVal);
            if ($lowerUnit === 'daduk' || $lowerUnit === 'dhaduk') {
                $unitVal = 'Daduk';
            } elseif ($lowerUnit === 'shreeji' || $lowerUnit === 'shreeji building') {
                $unitVal = 'Shreeji';
            } elseif ($lowerUnit === 'ichapur' || $lowerUnit === 'ichhapore' || $lowerUnit === 'ichhapor') {
                $unitVal = 'Ichapur';
            }
            $rowData['unit'] = $unitVal;
        }

        // If company_code is not resolved yet, infer it from the unique Unit
        if (empty($comp) && !empty($unitVal)) {
            $comp = $this->resolveCompanyFromUnit($unitVal);
        }

        $rowData['company_code'] = $comp;

        return $rowData;
    }

    public function import(Request $request)
    {
        set_time_limit(180);
        $imported = 0;
        $skipped = [];
        $rowReports = [];
        $companyCode = $request->company_code ?: null;
        if ($companyCode === 'all') {
            $companyCode = null;
        }
        $unit = $request->unit ?: null;
        $batchId = $request->batch_id ?: null;

        $rowsData = [];
        $fileName = '';

        if ($request->has('rows')) {
            $rowsData = $request->input('rows', []);
            if (is_string($rowsData)) {
                $rowsData = json_decode($rowsData, true) ?? [];
            }
            if (!is_array($rowsData)) {
                $rowsData = [];
            }
            $fileName = 'json-import-' . now()->format('Ymd_His') . '.json';
        } else {
            $request->validate(['file' => 'required|file']);
            $file = $request->file('file');
            $mapping = $request->mapping ? json_decode($request->mapping, true) : [];

            try {
                $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($file->getPathname());
                $rows = $spreadsheet->getActiveSheet()->toArray();
                $header = array_shift($rows);

                foreach ($rows as $rowIndex => $row) {
                    if (!array_filter($row, fn ($v) => $v !== null && $v !== '')) {
                        continue;
                    }
                    $row = array_slice(array_pad($row, count($header), null), 0, count($header));
                    $rowData = array_combine($header, $row);
                    if ($mapping) {
                        $mapped = [];
                        foreach ($mapping as $dbField => $excelCol) {
                            $mapped[$dbField] = $rowData[$excelCol] ?? null;
                        }
                        $rowData = $mapped;
                    }
                    $rowsData[] = $rowData;
                }
            } catch (\Throwable $e) {
                return response()->json(['status' => false, 'message' => 'Import failed: ' . $e->getMessage()], 500);
            }
            $fileName = $file->getClientOriginalName();
        }

        // Sanitize all row data to prevent space and Excel float suffix (.0) issues in phone numbers, codes, bank details, etc.
        $sanitizedRows = [];
        foreach ($rowsData as $rowData) {
            $sanitizedRows[] = $this->sanitizeRowData($rowData);
        }
        $rowsData = $sanitizedRows;

        // Cache existing codes and emails to avoid queries inside loop
        $empCodes = array_filter(array_map('trim', array_column($rowsData, 'emp_code')));
        $emails = array_filter(array_map('trim', array_column($rowsData, 'email')));

        $existingEmpCodes = [];
        if (!empty($empCodes)) {
            $existingEmpCodes = User::whereIn('emp_code', $empCodes)
                ->where('is_deleted', 0)
                ->select('emp_code', 'company_code')
                ->get()
                ->groupBy('emp_code')
                ->map(fn($group) => $group->pluck('company_code')->toArray())
                ->toArray();
        }

        $existingEmails = [];
        if (!empty($emails)) {
            $existingEmails = User::whereIn('email', $emails)
                ->where('is_deleted', 0)
                ->pluck('email')
                ->map(fn($e) => strtolower(trim($e)))
                ->toArray();
        }

        $hashedPasswordsCache = [];

        // Wrap the insertion loop in a single DB transaction for optimal performance
        \Illuminate\Support\Facades\DB::beginTransaction();

        try {
            foreach ($rowsData as $rowIndex => $rowData) {
                $excelRowNum = $rowIndex + 2;

                $rowData['role'] = 3;
                $rowData['company_code'] = $rowData['company_code'] ?? $companyCode ?? 'nidhi-impex';
                if ($unit && empty($rowData['unit'])) {
                    $rowData['unit'] = $unit;
                }

                // Date normalization
                if (isset($rowData['dob'])) {
                    $rowData['dob'] = $this->parseImportDate($rowData['dob']);
                }
                if (isset($rowData['joining_date'])) {
                    $rowData['joining_date'] = $this->parseImportDate($rowData['joining_date']);
                }
                if (isset($rowData['resignation_date'])) {
                    $rowData['resignation_date'] = $this->parseImportDate($rowData['resignation_date']);
                }

                $empCode = trim((string) ($rowData['emp_code'] ?? ''));
                if ($empCode === '') {
                    $reason = 'Missing employee code';
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                    continue;
                }
                $rowData['emp_code'] = $empCode;

                $companyOfRow = $rowData['company_code'];
                if (isset($existingEmpCodes[$empCode]) && in_array($companyOfRow, $existingEmpCodes[$empCode], true)) {
                    $reason = "Employee code '{$empCode}' already exists in the system";
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                    continue;
                }

                $email = trim((string) ($rowData['email'] ?? ''));
                if ($email !== '' && in_array(strtolower($email), $existingEmails, true)) {
                    $reason = "Email '{$email}' is already used by another employee";
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                    continue;
                }

                $providedPassword = $rowData['password'] ?? '';
                $rawPassword = $providedPassword !== '' ? $providedPassword : '12345678';
                if (!isset($hashedPasswordsCache[$rawPassword])) {
                    $hashedPasswordsCache[$rawPassword] = \Illuminate\Support\Facades\Hash::make($rawPassword);
                }
                $rowData['password'] = $hashedPasswordsCache[$rawPassword];
                $rowData['status'] = 0;

                try {
                    User::create($rowData);
                    $imported++;
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'passed', 'reason' => null, 'row_data' => $rowData];

                    // Track newly inserted in-memory
                    if (!isset($existingEmpCodes[$empCode])) {
                        $existingEmpCodes[$empCode] = [];
                    }
                    $existingEmpCodes[$empCode][] = $companyOfRow;

                    if ($email !== '') {
                        $existingEmails[] = strtolower($email);
                    }
                } catch (\Throwable $rowError) {
                    $reason = $this->friendlyImportError($rowError);
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                }
            }

            $batch = null;
            if ($batchId) {
                $batch = UploadBatch::find($batchId);
            }

            try {
                if ($batch) {
                    $batch->update([
                        'total_rows' => $batch->total_rows + count($rowReports),
                        'success_count' => $batch->success_count + $imported,
                        'failed_count' => $batch->failed_count + count($skipped),
                    ]);
                    $batch->rows()->createMany($rowReports);
                } else {
                    $batch = UploadBatch::create([
                        'type' => 'employee',
                        'company_code' => $companyCode,
                        'unit' => $unit,
                        'file_name' => $fileName,
                        'total_rows' => count($rowReports),
                        'success_count' => $imported,
                        'failed_count' => count($skipped),
                        'uploaded_by' => auth('api')->id(),
                    ]);
                    $batch->rows()->createMany($rowReports);
                    $batchId = $batch->id;
                }
            } catch (\Throwable $e) {
                \Log::error('Failed to record employee import batch: ' . $e->getMessage());
            }

            \Illuminate\Support\Facades\DB::commit();
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\DB::rollBack();
            return response()->json(['status' => false, 'message' => 'Import failed: ' . $e->getMessage()], 500);
        }

        $message = "$imported employees imported";
        if ($skipped) {
            $message .= '; ' . count($skipped) . ' row(s) skipped';
        }

        return response()->json([
            'status' => true,
            'message' => $message,
            'imported' => $imported,
            'skipped' => $skipped,
            'batch_id' => $batchId,
        ]);
    }

    public function importAccountDetail(Request $request)
    {
        $request->validate(['file' => 'required|file']);

        $imported = 0;
        $file = $request->file('file');

        try {
            $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($file->getPathname());
            $rows = $spreadsheet->getActiveSheet()->toArray();
            $header = array_shift($rows);

            foreach ($rows as $row) {
                $rowData = array_combine($header, $row);
                if (isset($rowData['emp_code'])) {
                    User::where('emp_code', $rowData['emp_code'])->update([
                        'bank_name'       => $rowData['bank_name'] ?? null,
                        'bank_account_no' => $rowData['bank_account_no'] ?? null,
                        'bank_ifsc_code'  => $rowData['bank_ifsc_code'] ?? null,
                    ]);
                    $imported++;
                }
            }
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => 'Import failed: ' . $e->getMessage()], 500);
        }

        return response()->json(['status' => true, 'message' => "$imported account details imported"]);
    }

    /**
     * Admin/agent editing an appointment or employee record by id or emp_code.
     * Only reachable via POST /appointment/update, gated to role:admin,agent —
     * never expose this on a route a plain employee token can hit.
     */
    public function updateUser(Request $request)
    {
        $this->assertPostNotTruncated($request);
        $request->validate(array_merge($this->photoUploadRules(), $this->documentUploadRules()));

        // Every file field is excluded from the raw input and re-added below as
        // a stored path, so no UploadedFile can be mass-assigned as a temp path.
        $data = array_intersect_key(
            $request->except(array_merge(['_token'], self::FILE_UPLOAD_FIELDS)),
            array_flip(self::APPOINTMENT_FIELDS)
        );

        $data = array_merge($data, $this->storeUploadedFiles($request, self::APPOINTMENT_FIELDS, $this->resolveDocumentOwner($request)));
        // Applied before any branch below picks a target, so every path through
        // this method is protected — not just the one that matches by id.
        $data = $this->withSafeAadhaar($data);

        $userAuth = auth('api')->user();

        $targetId = $request->id;
        if ($targetId) {
            $employee = User::find($targetId);
            if (!$employee) {
                return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
            }
            if (!$this->inManagedScope($userAuth, $employee)) {
                return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
            }
            $newEmpCode = isset($data['emp_code']) ? trim((string) $data['emp_code']) : null;
            if ($newEmpCode && $employee->emp_code !== $newEmpCode) {
                // Assigning an emp_code onto this record (typically converting
                // an appointment into a full employee) — without this check a
                // code already held by someone else silently becomes a second
                // row with the same emp_code instead of being rejected.
                $conflict = User::where('emp_code', $newEmpCode)
                    ->where('id', '!=', $employee->id)
                    ->first();
                if ($conflict) {
                    return response()->json([
                        'status' => false,
                        'message' => "Employee code '{$newEmpCode}' is already assigned to {$conflict->name}",
                    ], 422);
                }
                if (in_array($employee->type, ['appointment', 'pending_employee', 'trial'], true)) {
                    // Assigning a code from Employee Master is the onboarding
                    // decision itself — the record activates immediately rather
                    // than waiting on a separate password step. Note this still
                    // leaves the shared default password (12345678, see
                    // appointmentStore/postTrialForm) live on the account until
                    // the employee or an admin changes it.
                    $data['type'] = null;
                    $data['status'] = 0;
                    if ($employee->type === 'trial') {
                        // Leaving the trial pool for good — without this it would
                        // still match getTrialForms()'s `processed = 0` filter if
                        // the type were ever reverted, and audit trails read oddly
                        // showing an unprocessed trial that's already a real code.
                        $data['processed'] = 1;
                    }
                }
            }
            if ($request->has('checkbox')) {
                $data['checkbox'] = $request->checkbox;
                if ($request->checkbox == 1 && $employee->type === 'appointment') {
                    $data['type'] = 'pending_employee';
                    $data['status'] = 2; // Pending status
                } elseif ($request->checkbox == 0 && ($employee->type === 'pending_employee' || $employee->type === 'appointment')) {
                    $data['type'] = 'appointment';
                    $data['status'] = 2; // Rejected status
                }
            }
            $this->applyUpdate($employee, $data);
            return response()->json(['status' => true, 'message' => 'Employee updated', 'user' => $employee->fresh()]);
        }

        $empCode = $request->emp_code;
        if ($empCode) {
            $employee = User::where('emp_code', $empCode)->first();
            if ($employee) {
                if (!$this->inManagedScope($userAuth, $employee)) {
                    return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
                }
                $this->applyUpdate($employee, $data);
                return response()->json(['status' => true, 'message' => 'Employee updated', 'user' => $employee->fresh()]);
            }
        }

        if ($userAuth) {
            $this->applyUpdate($userAuth, $data);
            return response()->json(['status' => true, 'message' => 'Profile updated', 'user' => $userAuth->fresh()]);
        }

        return response()->json(['status' => false, 'message' => 'Unauthenticated'], 401);
    }

    /**
     * Self-service "my profile" update — POST /profile-update, reachable by
     * any authenticated role. Always operates on the caller's own record and
     * only ever touches SELF_PROFILE_FIELDS: any id/emp_code in the request
     * body is ignored, so this can never be used to edit someone else's
     * account or to change role/company_code/unit/salary/etc on your own.
     */
    public function updateProfile(Request $request)
    {
        $user = auth('api')->user();
        if (!$user) {
            return response()->json(['status' => false, 'message' => 'Unauthenticated'], 401);
        }

        $this->assertPostNotTruncated($request);

        $rules = array_merge($this->photoUploadRules(), [
            'email' => ['nullable', 'email', 'unique:users,email,' . $user->id],
        ]);

        $request->validate($rules);

        $data = array_intersect_key(
            $request->except(array_merge(['_token'], self::FILE_UPLOAD_FIELDS)),
            array_flip(self::SELF_PROFILE_FIELDS)
        );

        // SELF_PROFILE_FIELDS only permits 'photo', so an employee cannot write
        // their own ID-document fields through this endpoint.
        $data = array_merge($data, $this->storeUploadedFiles($request, self::SELF_PROFILE_FIELDS, $user));

        // The profile form posts its Aadhaar field back on every save. Before
        // this guard, a form that had only ever been shown the mask would write
        // "XXXX XXXX 1345" over the stored number — and move the owner's S3
        // document folder with it. Only a complete 12-digit value replaces.
        $data = $this->withSafeAadhaar($data);

        // If the employee is currently pending, mark them as active once they update their profile
        if ((int)$user->status === 2) {
            $data['status'] = 0;
        }

        $user->update($data);

        return response()->json(['status' => true, 'message' => 'Profile updated', 'user' => $user->fresh()]);
    }

    public function createAppointmentAccount(Request $request)
    {
        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'name' => 'required',
            'email' => 'required|email|unique:users',
            'mobile_number' => 'required|unique:users',
            'password' => 'required|min:6',
            'company_code' => 'required',
            'unit' => 'nullable',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $data = $request->all();
        $data['type'] = 'agent';
        $data['role'] = 4; // agent role
        $data['password'] = $data['password'];

        $employee = User::create($data);

        return response()->json(['status' => true, 'message' => 'Agent account created successfully.', 'data' => $employee]);
    }

    // Lets the Appointment Form ask "is this emp_code already taken?" before
    // the user commits, instead of only finding out after a failed submit.
    // exclude_id skips the appointment's own record when re-checking a code
    // that's already assigned to itself.
    public function checkEmployeeCode(Request $request)
    {
        $empCode = trim((string) $request->query('emp_code', ''));
        if ($empCode === '') {
            return response()->json(['status' => true, 'exists' => false]);
        }

        $query = User::where('emp_code', $empCode);
        if ($request->query('exclude_id')) {
            $query->where('id', '!=', $request->query('exclude_id'));
        }
        $employee = $query->first();

        if (!$employee) {
            return response()->json(['status' => true, 'exists' => false]);
        }

        return response()->json([
            'status' => true,
            'exists' => true,
            'employee' => [
                'id' => $employee->id,
                'name' => $employee->name,
                'company_code' => $employee->company_code,
            ],
        ]);
    }

    public function appointmentStore(Request $request)
    {
        $this->assertPostNotTruncated($request);
        $request->validate(array_merge($this->photoUploadRules(), $this->documentUploadRules()));

        // File fields are dropped from the raw input here and re-added as stored
        // paths below; otherwise the UploadedFile objects are mass-assigned and
        // land in the database as PHP temp paths.
        $raw = $request->except(self::FILE_UPLOAD_FIELDS);
        $empCode = $raw['emp_code'] ?? null;
        $addedBy = $raw['added_by'] ?? null;
        $trialFormId = $raw['trial_form_id'] ?? null;

        // This route is unauthenticated (public job-application form), so the
        // request body must never be trusted beyond the appointment-form
        // fields below — role/is_deleted/type/password/etc are only ever set
        // by this method itself, never taken from client input.
        $data = array_intersect_key($raw, array_flip(self::APPOINTMENT_FIELDS));
        $data = array_merge($data, $this->storeUploadedFiles($request, self::APPOINTMENT_FIELDS, $this->resolveDocumentOwner($request)));
        // Normalise on the way in so "1234 5678 9012" and "123456789012" yield
        // the same stored value and therefore the same document folder.
        $data = $this->withSafeAadhaar($data);

        // Every field on the appointment form is optional, so a blank email is an
        // ordinary submission. users.email is UNIQUE and will reject a second row
        // holding '' — NULL is the value a unique index allows any number of.
        if (array_key_exists('email', $data) && trim((string) $data['email']) === '') {
            $data['email'] = null;
        }

        // A record with no company matches no company-scoped list query, so it
        // would save and then never appear on the Appointments page. Fall back to
        // the company of whoever submitted it; a public submission with no
        // authenticated user legitimately has none to inherit.
        if (trim((string) ($data['company_code'] ?? '')) === '') {
            $submitter = auth('api')->user();

            if ($submitter?->company_code) {
                $data['company_code'] = $submitter->company_code;
            }
        }

        // Resolve the source trial form once. Converting it into an appointment
        // creates a brand-new users row, and users.email has a hard uniqueness
        // constraint at the database level — a validation exemption alone isn't
        // enough, the trial row's email must actually be freed first, or the
        // insert below still fails with a DB-level constraint violation.
        $trialForm = $trialFormId
            ? User::where('id', $trialFormId)->where('type', 'trial')->first()
            : null;
        if ($trialForm && $trialForm->email && strtolower(trim($trialForm->email)) === strtolower(trim($data['email'] ?? ''))) {
            $trialForm->update(['email' => null]);
        }

        if ($trialForm) {
            if (!isset($data['photo']) && $trialForm->photo) {
                $data['photo'] = $trialForm->photo;
            }
            if (!isset($data['adhar_image']) && $trialForm->adhar_image) {
                $data['adhar_image'] = $trialForm->adhar_image;
            }
        }

        $data['type'] = 'appointment';
        if ($empCode) {
            $employee = User::where('emp_code', $empCode)->first();
            if ($employee) {
                $validator = \Illuminate\Support\Facades\Validator::make($data, [
                    'email' => 'nullable|email|unique:users,email,' . $employee->id,
                ]);

                if ($validator->fails()) {
                    return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
                }

                $employee->update($data);
                if ($trialForm) {
                    $trialForm->update(['processed' => 1]);
                }
                return response()->json(['status' => true, 'message' => 'Appointment form updated']);
            }
        }

        $validator = \Illuminate\Support\Facades\Validator::make($data, [
            'email' => 'nullable|email|unique:users',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $data['password'] = '12345678';
        $data['role'] = 3;
        $data['type'] = 'appointment';

        $userAuth = auth('api')->user();
        if ($userAuth && $userAuth->type === 'agent' && empty($data['id'])) {
            $data['added_by'] = $userAuth->id;
        } elseif ($addedBy) {
            $data['added_by'] = $addedBy;
        }

        $employee = User::create($data);

        if ($trialForm) {
            $trialForm->update(['processed' => 1]);
        }

        return response()->json(['status' => true, 'message' => 'Appointment form submitted', 'data' => $employee]);
    }

    public function getAgentCandidates(Request $request)
    {
        // Once a trial form is processed into an appointment, it should only
        // show up as the appointment record — not linger as a trial form too.
        $query = User::where('added_by', $request->user()->id)
            ->where(function ($q) {
                $q->whereNull('type')
                  ->orWhere('type', '')
                  ->orWhere('type', '!=', 'trial')
                  ->orWhere('processed', 0);
            });
        $actor = $request->user();
        $disclosed = 0;

        // The agent dashboard shows the complete Aadhaar, so these rows carry it.
        // Scope is already the narrowest in the app — added_by is this agent — so a
        // row reaching here is one the agent created and can open individually.
        $candidates = $query->orderBy('id', 'desc')->get()->map(function (User $candidate) use ($actor, &$disclosed) {
            $data = $candidate->attributesToArray();

            $full = \App\Support\AadhaarDisclosure::fullFor($candidate, $actor);

            if ($full !== null) {
                $data['aadhaar_full'] = $full;
                $disclosed++;
            }

            return $data;
        });

        \App\Support\AadhaarDisclosure::auditListDisclosure(
            $actor,
            $disclosed,
            'AGENT_CANDIDATE_LIST_FULL_AADHAAR_DISCLOSED'
        );

        return response()->json(['status' => true, 'data' => $candidates]);
    }

    public function getAppointment(Request $request)
    {
        $userAuth = auth('api')->user();
        
        $query = User::where(function($q) {
                // Genuine pending appointments, plus legacy/untyped records that
                // haven't been assigned an emp_code yet. Once a record has both
                // a null/empty type AND an emp_code, it has already "graduated"
                // into a full employee and belongs on the Employees page only.
                $q->where('type', 'appointment')
                  ->orWhere(function($q2) {
                      $q2->where(function($q3) {
                          $q3->whereNull('type')->orWhere('type', '');
                      })->where(function($q4) {
                          $q4->whereNull('emp_code')->orWhere('emp_code', '');
                      });
                  });
            })
            ->where(function($q) {
                $q->where('role', '!=', 0)->orWhereNull('role');
            })
            ->with('addedBy:id,name,email,emp_code');

        if ($userAuth && $userAuth->type === 'agent') {
            $query->where('added_by', $userAuth->id);
        } elseif ($userAuth && ((int) $userAuth->role === 1 || (int) $userAuth->role === 0)) {
            $requested = $request->company_code && !in_array($request->company_code, ['all', 'all-companies'])
                ? array_filter(array_map('trim', explode(',', $request->company_code)))
                : [];

            // Role 1 may narrow within its own companies but never outside them;
            // only role 0 is unscoped when no filter is supplied.
            $own = array_filter(array_map('trim', explode(',', (string) $userAuth->company_code)));
            $codes = (int) $userAuth->role === 0
                ? $requested
                : ($requested ? array_intersect($requested, $own) : $own);

            if ($codes) {
                $query->whereIn('company_code', $codes);
            } elseif ((int) $userAuth->role !== 0) {
                $query->whereRaw('1 = 0');
            }
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            if (!in_array('all', $codes) && !in_array('all-companies', $codes)) {
                $query->whereIn('company_code', $codes);
            }
        }
        if ($request->unit) {
            $query->where('unit', $request->unit);
        }

        // The Aadhaar column on this page shows the complete number, so the list
        // has to carry it. The query above is already scoped — agents to records
        // they created, role 1 to their company, role 2 to their company and unit —
        // so a row reaching here is a row the caller may open individually anyway.
        //
        // aadhaar_full is written per row rather than appended on the model: an
        // accessor would emit it from every serialisation in the app, including
        // places this decision was never made about.
        $disclosed = 0;

        $appointments = $query->orderBy('id', 'desc')->get()->map(function ($item) use ($userAuth, &$disclosed) {
            $data = $item->attributesToArray();
            $data['agent'] = $item->addedBy
                ? $item->addedBy->only(['id', 'name', 'email', 'emp_code'])
                : null;

            $full = \App\Support\AadhaarDisclosure::fullFor($item, $userAuth);

            if ($full !== null) {
                $data['aadhaar_full'] = $full;
                $disclosed++;
            }

            return $data;
        });

        $appointments = $this->attachAppointmentPhotos($appointments);

        // One entry for the request, with a count and no values. Auditing per row
        // would turn one page view into hundreds of inserts and bury the trail.
        \App\Support\AadhaarDisclosure::auditListDisclosure(
            $userAuth,
            $disclosed,
            'APPOINTMENT_LIST_FULL_AADHAAR_DISCLOSED',
            ['unit' => $request->unit]
        );

        return response()->json([
            'status' => true,
            'data'   => [
                'appointments' => $appointments,
            ],
        ]);
    }

    /**
     * Appointment photos never land in the legacy `users.photo` column — the
     * upload step stores them as a PHOTOGRAPH Document instead (see
     * AppointmentModal.jsx / DocumentController::storeForAppointment), which
     * on the configured S3 provider is a private object with no public path.
     *
     * For any row still missing `photo`, look up its PHOTOGRAPH document and
     * mint a fresh presigned view URL — done here, per request, rather than
     * cached on the row, because a stored URL would go stale once the
     * presign TTL expires. Presigning is a local HMAC computation (no AWS
     * round trip), and one batched query covers every row, so this stays
     * cheap even for a full list.
     */
    private function attachAppointmentPhotos($rows)
    {
        $missingIds = $rows
            ->filter(fn ($row) => empty($row['photo']) && !empty($row['id']))
            ->pluck('id')
            ->all();

        if (empty($missingIds)) {
            return $rows;
        }

        $documents = \App\Models\Document::visible()
            ->where('document_type', 'PHOTOGRAPH')
            ->whereIn('user_id', $missingIds)
            ->with('currentVersionRecord')
            ->get()
            ->keyBy('user_id');

        if ($documents->isEmpty()) {
            return $rows;
        }

        $service = DocumentService::make();

        return $rows->map(function ($row) use ($documents, $service) {
            $document = $documents->get($row['id'] ?? null);
            $version = $document?->currentVersionRecord;

            if (!$document || !$version || !$document->isReadable()) {
                return $row;
            }

            try {
                $row['photo'] = $service->viewUrl($document, $version)['url'];
            } catch (\Throwable $e) {
                // Leave photo empty rather than fail the whole list over one row.
            }

            return $row;
        });
    }

    public function accountMaster(Request $request)
    {
        $request->validate(['file' => 'required|file']);

        $company_code = $request->company_code ?? 'nidhi-impex';
        $unit = $request->unit;
        $imported = 0;
        $skipped = [];
        $rowReports = [];

        try {
            $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($request->file('file')->getPathname());
            $rows = $spreadsheet->getActiveSheet()->toArray();
            $header = array_shift($rows);

            foreach ($rows as $rowIndex => $row) {
                if (!array_filter($row, fn ($v) => $v !== null && $v !== '')) {
                    continue; // blank row
                }

                $excelRowNum = $rowIndex + 2; // +1 for header, +1 for 1-index
                $row = array_slice(array_pad($row, count($header), null), 0, count($header));
                $rowData = array_combine($header, $row);

                if (empty($rowData['emp_code'])) {
                    $reason = 'Missing employee code';
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                    continue;
                }

                $updateData = [
                    'bank_name'       => $rowData['bank_name'] ?? null,
                    'bank_account_no' => $rowData['bank_account_no'] ?? null,
                    'bank_ifsc_code'  => $rowData['bank_ifsc_code'] ?? null,
                ];
                $query = User::where('emp_code', $rowData['emp_code'])
                    ->where('company_code', $company_code);
                if ($unit) {
                    $query->where('unit', $unit);
                }
                $affected = $query->update($updateData);

                if ($affected > 0) {
                    $imported++;
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'passed', 'reason' => null, 'row_data' => $rowData];
                } else {
                    $reason = 'No matching employee found for this company/unit';
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                }
            }
        } catch (\Throwable $e) {
            return response()->json(['status' => false, 'message' => 'Import failed: ' . $e->getMessage()], 500);
        }

        $batchId = null;
        try {
            $batch = UploadBatch::create([
                'type' => 'account-master',
                'company_code' => $company_code,
                'unit' => $unit ?: null,
                'file_name' => $request->file('file')->getClientOriginalName(),
                'total_rows' => count($rowReports),
                'success_count' => $imported,
                'failed_count' => count($skipped),
                'uploaded_by' => auth('api')->id(),
            ]);
            $batch->rows()->createMany($rowReports);
            $batchId = $batch->id;
        } catch (\Throwable $e) {
            \Log::error('Failed to record account-master import batch: ' . $e->getMessage());
        }

        $message = "$imported records updated";
        if ($skipped) {
            $message .= '; ' . count($skipped) . ' row(s) skipped';
        }

        return response()->json([
            'status' => true,
            'message' => $message,
            'imported' => $imported,
            'skipped' => $skipped,
            'batch_id' => $batchId,
        ]);
    }

    public function postTrialForm(Request $request)
    {
        $data = $request->all();
        $data['type'] = 'trial';
        // The users.role column defaults to 1 (Admin) at the DB level, and a
        // public trial-form submission never carries a role of its own — so
        // without this every trial submission silently became an Admin
        // account instead of a regular (role 3) candidate record.
        $data['role'] = 3;

        // If password is required by DB, give a default
        if (empty($data['password'])) {
            $data['password'] = '12345678';
        }
        
        $userAuth = auth('api')->user();
        if ($userAuth && $userAuth->type === 'agent' && empty($data['id'])) {
            $data['added_by'] = $userAuth->id;
        }
        
        $data = $this->withSafeAadhaar($data);

        $trialForm = User::create($data);

        $files = $this->storeUploadedFiles($request, ['photo', 'adhar_image'], $trialForm);
        if (!empty($files)) {
            $trialForm->update($files);
        }

        return response()->json(['status' => true, 'message' => 'Trial form submitted']);
    }

    public function getTrialForms(Request $request)
    {
        $userAuth = auth('api')->user();

        $query = User::where('type', 'trial');
        if (\App\Services\Authorization\SchemaSupport::hasColumn('users', 'processed')) {
            $query->where('processed', 0);
        }

        if ($userAuth && ((int) $userAuth->role === 1 || (int) $userAuth->role === 0)) {
            $requested = $request->company_code && !in_array($request->company_code, ['all', 'all-companies'])
                ? array_filter(array_map('trim', explode(',', $request->company_code)))
                : [];

            // Role 1 may narrow within its own companies but never outside them;
            // only role 0 is unscoped when no filter is supplied.
            $own = array_filter(array_map('trim', explode(',', (string) $userAuth->company_code)));
            $codes = (int) $userAuth->role === 0
                ? $requested
                : ($requested ? array_intersect($requested, $own) : $own);

            if ($codes) {
                $query->whereIn('company_code', $codes);
            } elseif ((int) $userAuth->role !== 0) {
                $query->whereRaw('1 = 0');
            }
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            if (!in_array('all', $codes) && !in_array('all-companies', $codes)) {
                $query->whereIn('company_code', $codes);
            }
        }
        if ($request->unit) {
            $query->where('unit', $request->unit);
        }

        $disclosed = 0;
        $trialForms = $query->orderBy('id', 'desc')->get();
        $trialForms->transform(function ($item) use ($userAuth, &$disclosed) {
            $full = \App\Support\AadhaarDisclosure::fullFor($item, $userAuth);
            if ($full) {
                $item->setAttribute('aadhaar_full', $full);
                $disclosed++;
            }
            return $item;
        });

        \App\Support\AadhaarDisclosure::auditListDisclosure(
            $userAuth,
            $disclosed,
            'TRIAL_FORM_LIST_FULL_AADHAAR_DISCLOSED'
        );

        return response()->json([
            'status' => true,
            'data'   => $trialForms,
        ]);
    }

    /**
     * Fields a trial-form edit may never set.
     *
     * User::$fillable is shared with employee creation, so it carries role,
     * password, company_code and is_deleted. update($request->all()) against
     * that list on a route agents can reach is a privilege-escalation
     * primitive. The trial form UI submits none of these: it sends the form
     * body, {print: 1} when printing, and {checkbox: 0|1} when approving.
     */
    private const TRIAL_FORM_PROTECTED_FIELDS = [
        'id', 'role', 'password', 'company_code', 'is_deleted',
        'emp_code', 'added_by', 'type', 'trial_form_id',
    ];

    /**
     * The trial form this caller may act on, or null.
     *
     * Mirrors the scoping getTrialForms() already applies so the list and the
     * operations on it agree: role 1 their company, role 2 their company and
     * unit, an agent their own submissions, role 0 everything. Pinned to
     * type = 'trial' so a trial-form route can never reach an employee or an
     * administrator row — both methods here previously took the id straight
     * from the URL and acted on whatever User::find() returned.
     */
    private function findTrialFormFor(?User $actor, $id): ?User
    {
        if (!$actor) {
            return null;
        }

        $query = User::where('type', 'trial')->whereKey($id);

        if ($actor->type === 'agent' || (int) $actor->role === 4) {
            $query->where('added_by', $actor->id);
        } elseif ((int) $actor->role === 1) {
            $query->where('company_code', $actor->company_code);
        } elseif ((int) $actor->role === 2) {
            $query->where('company_code', $actor->company_code)
                ->where('unit', $actor->unit);
        }

        return $query->first();
    }

    public function updateTrialForm($id, Request $request)
    {
        $user = $this->findTrialFormFor(auth('api')->user(), $id);
        if (!$user) {
            return response()->json(['status' => false, 'message' => 'Not found'], 404);
        }

        $data = Arr::except($request->all(), self::TRIAL_FORM_PROTECTED_FIELDS);
        $data = $this->withSafeAadhaar($data);

        $files = $this->storeUploadedFiles($request, ['photo', 'adhar_image'], $user);
        if (!empty($files)) {
            $data = array_merge($data, $files);
        }

        $user->update($data);

        return response()->json(['status' => true, 'message' => 'Trial form updated']);
    }

    public function deleteTrialForm($id)
    {
        // User has no SoftDeletes trait, so this is permanent — all the more
        // reason the row has to be one this caller owns.
        $user = $this->findTrialFormFor(auth('api')->user(), $id);
        if (!$user) {
            return response()->json(['status' => false, 'message' => 'Not found'], 404);
        }

        $user->delete();

        return response()->json(['status' => true, 'message' => 'Trial form deleted']);
    }

    public function getAgents(Request $request)
    {
        $userAuth = auth('api')->user();
        
        $query = User::where('type', 'agent');
        
        if ($userAuth && ((int) $userAuth->role === 1 || (int) $userAuth->role === 0)) {
            $requested = $request->company_code && !in_array($request->company_code, ['all', 'all-companies'])
                ? array_filter(array_map('trim', explode(',', $request->company_code)))
                : [];

            // Role 1 may narrow within its own companies but never outside them;
            // only role 0 is unscoped when no filter is supplied.
            $own = array_filter(array_map('trim', explode(',', (string) $userAuth->company_code)));
            $codes = (int) $userAuth->role === 0
                ? $requested
                : ($requested ? array_intersect($requested, $own) : $own);

            if ($codes) {
                $query->whereIn('company_code', $codes);
            } elseif ((int) $userAuth->role !== 0) {
                $query->whereRaw('1 = 0');
            }
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            if (!in_array('all', $codes) && !in_array('all-companies', $codes)) {
                $query->whereIn('company_code', $codes);
            }
        }
        
        $agents = $query->orderBy('id', 'desc')->get();
        return response()->json(['status' => true, 'data' => $agents]);
    }

    public function updateAgent($id, Request $request)
    {
        $agent = User::where('type', 'agent')->find($id);
        if (!$agent) {
            return response()->json(['status' => false, 'message' => 'Agent not found'], 404);
        }

        $validator = \Illuminate\Support\Facades\Validator::make($request->all(), [
            'name' => 'required',
            'email' => 'required|email|unique:users,email,' . $agent->id,
            'mobile_number' => 'required|unique:users,mobile_number,' . $agent->id,
            'company_code' => 'required',
            'unit' => 'nullable',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $data = $request->only(['name', 'email', 'mobile_number', 'company_code', 'unit']);
        if ($request->filled('password')) {
            $data['password'] = $request->password;
        }

        $agent->update($data);

        return response()->json(['status' => true, 'message' => 'Agent updated successfully.', 'data' => $agent]);
    }

    public function deleteAgent($id)
    {
        $agent = User::where('type', 'agent')->find($id);
        if (!$agent) {
            return response()->json(['status' => false, 'message' => 'Agent not found'], 404);
        }

        $agent->delete();

        return response()->json(['status' => true, 'message' => 'Agent deleted successfully.']);
    }
}
