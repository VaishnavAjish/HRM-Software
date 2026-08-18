<?php

namespace App\Http\Controllers;

use App\Exceptions\DocumentException;
use App\Models\Document;
use App\Models\EmployeeFamilyMember;
use App\Models\SalarySlip;
use App\Models\UploadBatch;
use App\Models\User;
use App\Services\Authorization\SchemaSupport;
use App\Services\Documents\DocumentService;
use App\Services\DocumentStorageService;
use App\Services\Provisioning\CompanyMembershipService;
use App\Services\Provisioning\UnitMembershipService;
use App\Services\Provisioning\UserProvisioningService;
use App\Support\AadhaarDisclosure;
use App\Support\AadhaarReference;
use App\Support\AuditLogger;
use App\Support\DocumentType;
use App\Support\HiddenAccounts;
use App\Support\ProvisioningContext;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date;
use RuntimeException;

class UserController extends Controller
{
    /**
     * The shared provisioning core.
     *
     * Every path in this controller that creates an account — the employee form,
     * its bulk import, the trial form, the appointment form — hands the row to
     * this so the canonical role and company membership are written the same way
     * the admin console writes them. They previously wrote users.role and
     * nothing else, which is how accounts ended up with a numeric tier and no
     * role in the authorization tables.
     */
    public function __construct(
        private readonly UserProvisioningService $provisioning,
        private readonly CompanyMembershipService $companies,
        private readonly UnitMembershipService $units,
    ) {}

    /**
     * The home unit a trial submission names, validated against its company.
     *
     * A unit id is checked to belong to the company the record is being filed
     * into — a unit is meaningless without its company, and two companies each
     * own one called "Ichapur", so the name alone identifies nothing.
     *
     * A legacy free-text unit is still accepted and stored as-is. It has to be:
     * the historical strings have no confirmed company ownership, so rejecting
     * them would break the form for the units people actually use, and mapping
     * them would be the guess the whole unit migration is gated on avoiding.
     *
     * @throws \App\Services\Provisioning\ProvisioningException
     */
    private function resolveTrialUnit(Request $request, string $companyCode): ?string
    {
        if (! $request->filled('unitId')) {
            $legacy = trim((string) $request->input('unit', ''));

            return $legacy === '' ? null : $legacy;
        }

        $companyId = DB::table('companies')->where('code', $companyCode)->value('id');

        $unit = DB::table('units')
            ->where('id', (int) $request->input('unitId'))
            ->when($companyId, fn ($query) => $query->where('company_id', $companyId))
            ->where('is_active', true)
            ->first(['name']);

        if (! $unit) {
            throw new \App\Services\Provisioning\ProvisioningException(
                'UNIT_OUTSIDE_COMPANY',
                'That unit does not belong to the company this record is being filed into.',
                422
            );
        }

        return $unit->name;
    }

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

    /**
     * Fields a trial-form submission is allowed to write.
     *
     * Mirrors the form's own field set, and deliberately excludes everything
     * that decides who the record is or what it may do: role, type, password,
     * status, is_deleted, processed, added_by. Those are set by postTrialForm
     * itself. The list matches Node's TRIAL_FORM_PROTECTED_FIELDS in intent —
     * that port stripped them from the outset, and this side did not.
     *
     * company_code is NOT on this list. The tenant is resolved from the actor by
     * CompanyMembershipService::resolveCodeFor(), because that value is what
     * every scope check partitions on — a request naming a company is asking to
     * place a record inside a tenant, which is an authorization question and not
     * a fact about the candidate.
     */
    private const TRIAL_FIELDS = [
        'form_no', 'trial_date', 'department', 'designation', 'name', 'address',
        'mobile_number', 'mobile_no_2', 'gender', 'email', 'unit', 'punching_no',
        'last_company_name', 'last_company_address', 'experience', 'reason_for_leaving',
        'hastak_name', 'hastak_code', 'hastak_mobile', 'hastak_department',
        'contractor', 'manager_name', 'akar', 'emp_signature', 'manager_signature',
        'hastak_signature', 'hr_signature', 'aadhar_card_no',
    ];

    // Fields a logged-in user may change on their own profile via /profile-update.
    // Intentionally excludes role, company_code, unit, emp_code, is_deleted,
    // salary, bank/tax details — none of that should be self-service.
    private const SELF_PROFILE_FIELDS = [
        'name', 'email', 'mobile_number', 'dob', 'address', 'photo',
        'city', 'district', 'state', 'pin',
        'aadhar_card_no', 'pan_card_no', 'bank_name', 'bank_ifsc_code',
        'bank_account_no', 'pf_no', 'esi_no',
        'gender', 'department', 'designation', 'joining_date',
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
        return ['photo' => 'nullable|image|mimes:jpeg,jpg,png,webp|max:'.$this->maxUploadKb()];
    }

    /** Scanned ID documents — unlike photo these may also be PDFs. */
    private function documentUploadRules(): array
    {
        $max = $this->maxUploadKb();
        $rule = 'nullable|file|mimes:jpeg,jpg,png,webp,pdf|max:'.$max;

        return [
            'adhar_image' => $rule,
            'pan_image' => $rule,
            'check_image' => $rule,
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
                    .round($postMax / 1048576, 1).' MB in total). Please upload smaller files.',
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
            'emp_code' => $empCode ?: ($aadhaar ? null : $this->pendingOwnerRef($request)),
            'name' => $name ?: null,
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
        if (! array_key_exists('aadhar_card_no', $data)) {
            return $data;
        }

        $incoming = $data['aadhar_card_no'];

        // Scalar-only: an array or object here is malformed input, never a number.
        $digits = is_scalar($incoming) ? AadhaarReference::normalise((string) $incoming) : '';

        if (! AadhaarReference::isValid($digits)) {
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

        if (! $seed) {
            // Nothing identifying at all — keep this submission's files together
            // without colliding with anyone else's.
            $seed = json_encode($request->except(self::FILE_UPLOAD_FIELDS)).microtime(true);
        }

        return 'PENDING'.strtoupper(substr(sha1((string) $seed), 0, 10));
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
            if (! $request->hasFile($field)) {
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
        if (! $userAuth) {
            return true;
        }
        // Super admins manage every company.
        if ((int) $userAuth->role === 0) {
            return true;
        }
        if ((int) $userAuth->role === 1) {
            return $employee->company_code === $userAuth->company_code;
        }
        if ((int) $userAuth->role === 2) {
            return $employee->company_code === $userAuth->company_code
                && $employee->unit === $userAuth->unit;
        }
        // SECURITY FIX: Agents (role 4 / type=agent) are scoped to records they created.
        if ((int) $userAuth->role === 4 || $userAuth->type === 'agent') {
            return $employee->added_by === $userAuth->id;
        }

        return false;
    }

    /**
     * Strips fields a non-super-admin must not be able to grant themselves or
     * anyone else through a plain field update: promotion to super admin
     * (role 0), and moving a record to a different company/unit than the
     * acting admin manages.
     */
    private function guardPrivilegedFields($userAuth, array $data): array
    {
        // Account/security flags are never client-settable through a profile
        // edit, whoever the actor is: they are managed only by dedicated,
        // audited provisioning/role flows. Stripping them here closes stealth
        // (is_hidden/is_system_account) and escalation (is_super_admin) mass
        // assignment even for a Super Admin editing through this generic form.
        unset(
            $data['is_super_admin'],
            $data['is_hidden'],
            $data['is_system_account'],
            $data['is_protected'],
            $data['added_by'],
            $data['permissions']
        );

        if (! $userAuth || (int) $userAuth->role === 0) {
            return $data;
        }

        // A normal employee edit must not change authorization-bearing fields.
        // Tier/role changes go through the role-assignment endpoints (which
        // enforce RoleHierarchy); soft-delete has its own guarded flow. Under
        // shadow enforcement the numeric `role`/`type` tier is the effective
        // authority, so allowing it here mints admin/agent accounts.
        unset($data['role'], $data['type'], $data['is_deleted']);

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

        if ($status !== null && (string) $status === '2') {
            $query->where('type', 'pending_employee')
                ->where('status', 2);
        } else {
            $query->whereNotNull('emp_code')
                ->where('emp_code', '!=', '')
                ->where(function ($q) {
                    $q->whereNull('type')
                        ->orWhereNotIn('type', ['appointment', 'agent', 'pending_employee']);
                });
            if ($status !== null && $status !== '') {
                $statusStr = (string) $status;
                $statusLower = strtolower($statusStr);

                if ($statusLower === 'active' || $statusStr === '0') {
                    $query->where('status', 0);
                } elseif ($statusLower === 'inactive' || $statusStr === '1') {
                    $query->where('status', 1);
                } elseif ($statusLower === 'pending' || $statusStr === '2') {
                    $query->where('status', 2);
                } elseif ($statusLower === 'resigned') {
                    $query->whereNotNull('resignation_date')
                        ->where('resignation_date', '<=', date('Y-m-d'));
                } else {
                    $query->where('status', $status);
                }
            }
        }

        $userAuth = auth('api')->user();
        if ($userAuth && ((int) $userAuth->role === 1 || (int) $userAuth->role === 0)) {
            $requested = $request->company_code && ! in_array($request->company_code, ['all', 'all-companies'])
                ? array_filter(array_map('trim', explode(',', $request->company_code)))
                : [];

            // Role 1 may narrow within its own companies but never outside them;
            // only role 0 is unscoped when no filter is supplied.
            $own = array_filter(array_map('trim', explode(',', (string) $userAuth->company_code)));
            $codes = (int) $userAuth->role === 0
                ? $requested
                : ($requested ? array_intersect($requested, $own) : $own);

            if ($codes) {
                $query->where(function ($q) use ($codes) {
                    foreach ($codes as $code) {
                        if ($code === 'nidhi-impex' || stripos($code, 'nidhi') !== false) {
                            $q->orWhere('company_code', 'nidhi-impex')->orWhere('company_code', 'like', '%nidhi%');
                        } elseif ($code === 'silverstar' || $code === 'silver-star' || stripos($code, 'silver') !== false) {
                            $q->orWhere('company_code', 'silverstar')->orWhere('company_code', 'like', '%silver%');
                        } else {
                            $q->orWhere('company_code', 'like', "%{$code}%");
                        }
                    }
                });
            } elseif ((int) $userAuth->role !== 0) {
                $query->whereRaw('1 = 0');
            }
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            if (! in_array('all', $codes) && ! in_array('all-companies', $codes)) {
                $query->whereIn('company_code', $codes);
            }
        }

        if ($request->department) {
            $query->where('department', 'like', "%{$request->department}%");
        }

        if ($request->unit) {
            $query->where('unit', 'like', "%{$request->unit}%");
        }

        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('name', 'like', "%{$request->search}%")
                    ->orWhere('emp_code', 'like', "%{$request->search}%")
                    ->orWhere('email', 'like', "%{$request->search}%");
            });
        }

        $perPage = $request->limit ?? 15;
        $employees = $query->orderBy('id', 'desc')->paginate($perPage);
        $total = $employees->total();
        $activeCount = $total;
        $inactiveCount = 0;

        // The employee table shows the complete Aadhaar, so the paginated rows
        // carry it. Same reasoning as the appointment list: the query above is
        // already company- and unit-scoped, and only the current page's rows are
        // disclosed rather than the whole table.
        $disclosed = 0;

        $rows = collect($employees->items())->map(function (User $employee) use ($userAuth, &$disclosed) {
            $data = $employee->attributesToArray();

            $full = AadhaarDisclosure::fullFor($employee, $userAuth);

            if ($full !== null) {
                $data['aadhaar_full'] = $full;
                $disclosed++;
            }

            return $data;
        })->all();

        AadhaarDisclosure::auditListDisclosure(
            $userAuth,
            $disclosed,
            'EMPLOYEE_LIST_FULL_AADHAAR_DISCLOSED',
            ['page' => $employees->currentPage(), 'unit' => $request->unit]
        );

        return response()->json([
            'status' => true,
            'data' => [
                'users' => [
                    'data' => $rows,
                    'total' => $employees->total(),
                    'per_page' => $employees->perPage(),
                    'current_page' => $employees->currentPage(),
                    'last_page' => $employees->lastPage(),
                ],
                'active_users' => $activeCount,
                'inactive_users' => $inactiveCount,
            ],
        ]);
    }

    public function show($id, Request $request)
    {
        $employee = User::find($id);
        if (! $employee) {
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
        $payload = AadhaarDisclosure::attach(
            $employee->toArray(),
            $employee,
            $userAuth,
            'EMPLOYEE_FULL_AADHAAR_VIEWED'
        );

        if (SchemaSupport::hasTable('employee_family_members')) {
            $payload['family_members'] = EmployeeFamilyMember::where('user_id', $employee->id)
                ->orderBy('id')
                ->get(['id', 'name', 'relation', 'mobile_number'])
                ->toArray();
        }

        return response()->json(['status' => true, 'data' => $payload]);
    }

    public function store(Request $request)
    {
        // This is the standard-employee onboarding endpoint ONLY. It always
        // provisions a legacy tier-3 employee with a null account type. Any
        // privileged, manager, administrator or agent account is created through
        // /v1/admin/users, which applies the assignable-role policy, canonical
        // role ids, admin.user.create and the guarded provisioning service.
        //
        // Reject — rather than silently downgrade — any attempt to mint a
        // non-employee role or set an account type here, so an escalation attempt
        // is visible instead of quietly ignored.
        $requestedRole = $request->input('role');
        if ($requestedRole !== null && $requestedRole !== '' && (int) $requestedRole !== 3) {
            return response()->json([
                'status' => false,
                'message' => 'This endpoint onboards standard employees only. Use admin user management to create privileged, manager, administrator or agent accounts.',
            ], 403);
        }

        $requestedType = $request->input('type');
        if ($requestedType !== null && $requestedType !== '') {
            return response()->json([
                'status' => false,
                'message' => 'This endpoint onboards standard employees only and cannot set an account type.',
            ], 403);
        }

        $actingUser = auth('api')->user();
        $requestedCompanyCode = trim((string) $request->company_code);

        // SECURITY FIX: Validate company_code against actor's scope.
        if ($actingUser && (int) $actingUser->role !== 0) {
            if ((int) $actingUser->role === 1) {
                $allowed = array_filter(array_map('trim', explode(',', (string) $actingUser->company_code)));
                if (! in_array($requestedCompanyCode, $allowed, true)) {
                    return response()->json(['status' => false, 'message' => 'Company code not allowed for your account'], 403);
                }
            } elseif ((int) $actingUser->role === 2) {
                if ($requestedCompanyCode !== $actingUser->company_code) {
                    return response()->json(['status' => false, 'message' => 'Company code not allowed for your account'], 403);
                }
            }
        }

        $validator = Validator::make($request->all(), [
            'name' => 'required',
            'email' => 'nullable|email|unique:users',
            'password' => 'nullable|min:8',
            'emp_code' => 'nullable|unique:users',
            'company_code' => 'required',
            'unit' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        [$familyRows, $familyError] = $this->parseFamilyMembers($request);
        if ($familyError) {
            return $familyError;
        }

        $data = $request->all();
        // Account/security flags are never client-settable at create time:
        // strip is_super_admin / stealth flags / is_deleted / added_by so a
        // mass-assigned create cannot mint a hidden or super-admin account.
        // role and type are forced below to the standard-employee values, so any
        // client-supplied values here are irrelevant.
        unset(
            $data['is_super_admin'],
            $data['is_hidden'],
            $data['is_system_account'],
            $data['is_protected'],
            $data['is_deleted'],
            $data['added_by'],
            $data['permissions']
        );
        // SECURITY FIX: Generate a cryptographically random default password instead of '12345678'.
        $data['password'] = $request->password ?? bin2hex(random_bytes(16));
        // Standard-employee onboarding: legacy tier 3, normal employee type.
        // Enforced here regardless of input; privileged creation is a different
        // endpoint entirely.
        $data['role'] = 3;
        $data['type'] = null;
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

        // One transaction: an account that exists without its canonical role is
        // worse than no account, because the operator is told it worked and the
        // user holds nothing.
        $employee = DB::transaction(function () use ($data, $actingUser) {
            $created = User::create($data);

            // This form still posts a numeric tier rather than a role id, so the
            // canonical role is derived from it. Deriving it is the change: until
            // now the tier was the only thing written, and the account appeared in
            // the Permission Matrix holding nothing.
            $this->provisioning->provisionFromTier($created, ProvisioningContext::EMPLOYEE_FORM, $actingUser);

            return $created;
        });

        $this->saveFamilyMembers($employee, $familyRows);

        return response()->json(['status' => true, 'message' => 'Employee created', 'data' => $employee]);
    }

    public function update($id, Request $request)
    {
        $employee = User::find($id);
        if (! $employee) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        $userAuth = auth('api')->user();
        if (! $this->inManagedScope($userAuth, $employee)) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        [$familyRows, $familyError] = $this->parseFamilyMembers($request);
        if ($familyError) {
            return $familyError;
        }

        $data = $this->guardPrivilegedFields($userAuth, $request->all());
        // The employee edit form cannot see the stored number either, so it
        // posts aadhar_card_no: null. Without this the first edit of any
        // employee erased their Aadhaar and detached them from their documents.
        $data = $this->withSafeAadhaar($data);

        // A blank or absent password means "leave it unchanged": never overwrite
        // the stored hash with a hash of an empty string. When the password does
        // change, stamp password_changed_at so JwtMiddleware invalidates every
        // token issued before now — an admin/HR reset of a compromised account
        // kills its live sessions. Set directly (it is not mass-assignable) so it
        // rides the same UPDATE statement as the password in applyUpdate().
        if (! (array_key_exists('password', $data) && filled($data['password']))) {
            unset($data['password']);
        } else {
            $employee->password_changed_at = now();
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
        $this->saveFamilyMembers($employee, $familyRows);

        return response()->json(['status' => true, 'message' => 'Employee updated', 'data' => $employee]);
    }

    private function parseFamilyMembers(Request $request): array
    {
        if (! $request->has('family_members') || ! SchemaSupport::hasTable('employee_family_members')) {
            return [null, null];
        }

        $rows = $request->input('family_members');

        if (! is_array($rows)) {
            return [null, response()->json(['status' => false, 'message' => 'Family details must be a list of members.'], 422)];
        }

        $relations = ['Father', 'Mother', 'Spouse', 'Son', 'Daughter', 'Brother', 'Sister', 'Guardian', 'Other'];
        $clean = [];

        foreach (array_values($rows) as $i => $row) {
            if (! is_array($row)) {
                continue;
            }

            $name = trim((string) ($row['name'] ?? ''));
            $relation = trim((string) ($row['relation'] ?? ''));
            $rawMobile = trim((string) ($row['mobile_number'] ?? ''));
            $mobile = preg_replace('/\D+/', '', $rawMobile);
            $mobile = strlen($mobile) > 10 ? substr($mobile, -10) : $mobile;

            if ($name === '' && $relation === '' && $rawMobile === '') {
                continue;
            }

            $n = $i + 1;

            if ($name === '' || mb_strlen($name) > 150) {
                return [null, response()->json(['status' => false, 'message' => "Family member {$n}: enter a valid name."], 422)];
            }

            if ($relation === '' || (! in_array($relation, $relations, true) && mb_strlen($relation) > 50)) {
                return [null, response()->json(['status' => false, 'message' => "Family member {$n}: select a valid relation."], 422)];
            }

            if ($rawMobile !== '' && strlen($mobile) !== 10) {
                return [null, response()->json(['status' => false, 'message' => "Family member {$n}: enter a valid 10-digit mobile number."], 422)];
            }

            $clean[] = [
                'name' => $name,
                'relation' => $relation,
                'mobile_number' => $mobile === '' ? null : $mobile,
            ];
        }

        return [$clean, null];
    }

    private function saveFamilyMembers(User $employee, ?array $rows): void
    {
        if ($rows === null) {
            return;
        }

        DB::transaction(function () use ($employee, $rows) {
            EmployeeFamilyMember::where('user_id', $employee->id)->delete();

            foreach ($rows as $row) {
                EmployeeFamilyMember::create($row + ['user_id' => $employee->id]);
            }
        });
    }

    public function destroy($id, Request $request)
    {
        $employee = User::find($id);
        if (! $employee) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        if (! $this->inManagedScope(auth('api')->user(), $employee)) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        $this->deleteAudited($employee, $request);

        return response()->json(['status' => true, 'message' => 'Employee deleted']);
    }

    public function destroyMultiple(Request $request)
    {
        $ids = $request->input('ids', []);
        if (! is_array($ids) || empty($ids)) {
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
            'id' => $employee->id,
            'name' => $employee->name,
            'emp_code' => $employee->emp_code,
            'email' => $employee->email,
            'role' => $employee->role,
            'company_code' => $employee->company_code,
            'unit' => $employee->unit,
            'department' => $employee->department,
            'type' => $employee->type,
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
            if (! in_array('all', $codes) && ! in_array('all-companies', $codes)) {
                $slips->whereIn('company_code', $codes);
            }
        }

        return response()->json([
            'status' => true,
            'data' => [
                'total_slips' => $slips->count(),
                'recent_slips' => $slips->orderBy('id', 'desc')->take(5)->get(),
                'user' => $user,
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
                return Carbon::instance(Date::excelToDateTimeObject($val))->toDateString();
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
                return Carbon::createFromFormat($fmt, $val)->toDateString();
            } catch (\Throwable $e) {
                // continue
            }
        }

        try {
            return Carbon::parse($val)->toDateString();
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
            $val = trim((string) $rowData['emp_code']);
            if (str_ends_with($val, '.0')) {
                $val = substr($val, 0, -2);
            }
            $rowData['emp_code'] = $val;
        }

        // 2. Mobile Number
        if (isset($rowData['mobile_number'])) {
            $val = trim((string) $rowData['mobile_number']);
            if (str_ends_with($val, '.0')) {
                $val = substr($val, 0, -2);
            }
            $rowData['mobile_number'] = preg_replace('/\D/', '', $val);
        }

        // 3. Email
        if (isset($rowData['email'])) {
            $email = strtolower(trim((string) $rowData['email']));
            if ($email === '0' || $email === '0.0' || $email === '' || ! filter_var($email, FILTER_VALIDATE_EMAIL)) {
                $rowData['email'] = null;
            } else {
                $rowData['email'] = $email;
            }
        }

        // 4. Aadhaar Card Number
        if (isset($rowData['aadhar_card_no'])) {
            $val = trim((string) $rowData['aadhar_card_no']);
            if (str_ends_with($val, '.0')) {
                $val = substr($val, 0, -2);
            }
            $rowData['aadhar_card_no'] = preg_replace('/\D/', '', $val);
        }

        // 5. PAN Card Number
        if (isset($rowData['pan_card_no'])) {
            $rowData['pan_card_no'] = strtoupper(preg_replace('/\s+/', '', (string) $rowData['pan_card_no']));
        }

        // 6. Bank Account No
        if (isset($rowData['bank_account_no'])) {
            $val = trim((string) $rowData['bank_account_no']);
            if (str_ends_with($val, '.0')) {
                $val = substr($val, 0, -2);
            }
            $rowData['bank_account_no'] = preg_replace('/\s+/', '', $val);
        }

        // 7. Bank IFSC Code
        if (isset($rowData['bank_ifsc_code'])) {
            $rowData['bank_ifsc_code'] = strtoupper(preg_replace('/\s+/', '', (string) $rowData['bank_ifsc_code']));
        }

        // 8. Gender
        if (isset($rowData['gender'])) {
            $gender = strtolower(trim((string) $rowData['gender']));
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
            $comp = strtolower(trim((string) $rowData['company_code']));
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
            $unitVal = trim((string) $rowData['unit']);
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
        if (empty($comp) && ! empty($unitVal)) {
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
            if (! is_array($rowsData)) {
                $rowsData = [];
            }
            $fileName = 'json-import-'.now()->format('Ymd_His').'.json';
        } else {
            $request->validate(['file' => 'required|file|max:10240|mimes:xlsx,xls,csv,txt']);
            $file = $request->file('file');
            $mapping = $request->mapping ? json_decode($request->mapping, true) : [];

            try {
                $spreadsheet = IOFactory::load($file->getPathname());
                $rows = $spreadsheet->getActiveSheet()->toArray();
                $header = array_shift($rows);

                foreach ($rows as $rowIndex => $row) {
                    if (! array_filter($row, fn ($v) => $v !== null && $v !== '')) {
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
                return response()->json(['status' => false, 'message' => 'Import failed: '.$e->getMessage()], 500);
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
        if (! empty($empCodes)) {
            $existingEmpCodes = User::whereIn('emp_code', $empCodes)
                ->where('is_deleted', 0)
                ->select('emp_code', 'company_code')
                ->get()
                ->groupBy('emp_code')
                ->map(fn ($group) => $group->pluck('company_code')->toArray())
                ->toArray();
        }

        $existingEmails = [];
        if (! empty($emails)) {
            $existingEmails = User::whereIn('email', $emails)
                ->where('is_deleted', 0)
                ->pluck('email')
                ->map(fn ($e) => strtolower(trim($e)))
                ->toArray();
        }

        $hashedPasswordsCache = [];
        // Ids of the rows that actually landed, so their canonical roles and
        // company memberships are written once for the batch rather than per
        // row — an import of several hundred employees must not turn into
        // several hundred separate role transactions.
        $provisioned = [];

        // Wrap the insertion loop in a single DB transaction for optimal performance
        DB::beginTransaction();

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
                // SECURITY FIX: never fall back to a shared default; each row
                // without a password gets a unique random one (recoverable via
                // the OTP reset flow).
                $rawPassword = $providedPassword !== '' ? $providedPassword : bin2hex(random_bytes(16));
                if (! isset($hashedPasswordsCache[$rawPassword])) {
                    $hashedPasswordsCache[$rawPassword] = Hash::make($rawPassword);
                }
                $rowData['password'] = $hashedPasswordsCache[$rawPassword];
                $rowData['status'] = 0;

                try {
                    $provisioned[] = User::create($rowData)->id;
                    $imported++;
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'passed', 'reason' => null, 'row_data' => $rowData];

                    // Track newly inserted in-memory
                    if (! isset($existingEmpCodes[$empCode])) {
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
                \Log::error('Failed to record employee import batch: '.$e->getMessage());
            }

            // Inside the same transaction as the inserts. A batch that imports
            // the rows and then fails to give them roles is worse than one that
            // imports nothing: the operator is told it succeeded and the
            // accounts hold no permissions.
            $this->provisioning->provisionManyFromTier($provisioned, ProvisioningContext::IMPORT, auth('api')->user());

            DB::commit();
        } catch (\Throwable $e) {
            DB::rollBack();

            return response()->json(['status' => false, 'message' => 'Import failed: '.$e->getMessage()], 500);
        }

        $message = "$imported employees imported";
        if ($skipped) {
            $message .= '; '.count($skipped).' row(s) skipped';
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
        $request->validate(['file' => 'required|file|max:10240|mimes:xlsx,xls,csv,txt']);

        $imported = 0;
        $skipped = 0;
        $file = $request->file('file');
        $userAuth = auth('api')->user();

        try {
            $spreadsheet = IOFactory::load($file->getPathname());
            $rows = $spreadsheet->getActiveSheet()->toArray();
            $header = array_shift($rows);

            foreach ($rows as $row) {
                $rowData = array_combine($header, $row);
                if (isset($rowData['emp_code'])) {
                    $employee = User::where('emp_code', $rowData['emp_code'])->first();
                    if (! $employee) {
                        $skipped++;

                        continue;
                    }
                    // SECURITY FIX: Enforce actor's company/unit scope.
                    if (! $this->inManagedScope($userAuth, $employee)) {
                        $skipped++;

                        continue;
                    }

                    $employee->update([
                        'bank_name' => $rowData['bank_name'] ?? null,
                        'bank_account_no' => $rowData['bank_account_no'] ?? null,
                        'bank_ifsc_code' => $rowData['bank_ifsc_code'] ?? null,
                    ]);
                    $imported++;
                }
            }
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => 'Import failed: '.$e->getMessage()], 500);
        }

        return response()->json(['status' => true, 'message' => "$imported account details imported".($skipped ? " ($skipped skipped due to scope)" : '')]);
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
            if (! $employee) {
                return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
            }
            if (! $this->inManagedScope($userAuth, $employee)) {
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
                if (! $this->inManagedScope($userAuth, $employee)) {
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
        if (! $user) {
            return response()->json(['status' => false, 'message' => 'Unauthenticated'], 401);
        }

        $this->assertPostNotTruncated($request);

        $rules = array_merge($this->photoUploadRules(), [
            'email' => ['nullable', 'email', 'unique:users,email,'.$user->id],
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
        if ((int) $user->status === 2) {
            $data['status'] = 0;
        }

        $user->update($data);

        return response()->json(['status' => true, 'message' => 'Profile updated', 'user' => $user->fresh()]);
    }

    public function createAppointmentAccount(Request $request)
    {
        $validator = Validator::make($request->all(), [
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

        if (! $employee) {
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
            // getRawOriginal(), not the ->photo/->adhar_image accessors: those
            // resolve an S3 key to a short-lived presigned URL (expires in
            // minutes, and can run well past the varchar(255) column limit).
            // Carrying the record over must copy the stored object key itself.
            $trialPhoto = $trialForm->getRawOriginal('photo');
            $trialAdharImage = $trialForm->getRawOriginal('adhar_image');

            if (! isset($data['photo']) && $trialPhoto) {
                $data['photo'] = $trialPhoto;
            }
            if (! isset($data['adhar_image']) && $trialAdharImage) {
                $data['adhar_image'] = $trialAdharImage;
            }
            if (! isset($data['punching_no']) && ! empty($trialForm->form_no)) {
                $data['punching_no'] = $trialForm->form_no;
            }
        }

        $data['type'] = 'appointment';
        if ($empCode) {
            $employee = User::where('emp_code', $empCode)->first();
            if ($employee) {
                $validator = Validator::make($data, [
                    'email' => 'nullable|email|unique:users,email,'.$employee->id,
                ]);

                if ($validator->fails()) {
                    return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
                }

                DB::transaction(function () use ($employee, $data, $trialForm) {
                    $employee->update($data);

                    // Idempotent by construction: an appointment re-submitted
                    // against an employee code that already exists updates that
                    // record and re-asserts the same role, rather than minting a
                    // second account for one person.
                    $this->provisioning->provisionEmployee(
                        $employee,
                        ProvisioningContext::APPOINTMENT,
                        auth('api')->user()
                    );

                    if ($trialForm) {
                        $trialForm->update(['processed' => 1]);
                    }
                });

                return response()->json(['status' => true, 'message' => 'Appointment form updated']);
            }
        }

        $validator = Validator::make($data, [
            'email' => 'nullable|email|unique:users',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        // SECURITY FIX: a random credential rather than the shared default;
        // the owner recovers it through the OTP reset flow.
        $data['password'] = bin2hex(random_bytes(16));
        $data['role'] = 3;
        $data['type'] = 'appointment';

        $userAuth = auth('api')->user();
        if ($userAuth && $userAuth->type === 'agent' && empty($data['id'])) {
            $data['added_by'] = $userAuth->id;
        } elseif ($addedBy) {
            $data['added_by'] = $addedBy;
        }

        $employee = DB::transaction(function () use ($data, $userAuth, $trialForm) {
            $created = User::create($data);

            $this->provisioning->provisionEmployee($created, ProvisioningContext::APPOINTMENT, $userAuth);

            if ($trialForm) {
                $trialForm->update(['processed' => 1]);
            }

            return $created;
        });

        return response()->json(['status' => true, 'message' => 'Appointment form submitted', 'data' => $employee]);
    }

    public function getAgentCandidates(Request $request)
    {
        // Once a trial form is processed into an appointment, it should only
        // show up as the appointment record — not linger as a trial form too.
        $query = User::where('added_by', $request->user()->id);
        $actor = $request->user();
        $disclosed = 0;

        // The agent dashboard shows the complete Aadhaar, so these rows carry it.
        // Scope is already the narrowest in the app — added_by is this agent — so a
        // row reaching here is one the agent created and can open individually.
        $candidates = $query->orderBy('id', 'desc')->get()->map(function (User $candidate) use ($actor, &$disclosed) {
            $data = $candidate->attributesToArray();

            $full = AadhaarDisclosure::fullFor($candidate, $actor);

            if ($full !== null) {
                $data['aadhaar_full'] = $full;
                $disclosed++;
            }

            return $data;
        });

        AadhaarDisclosure::auditListDisclosure(
            $actor,
            $disclosed,
            'AGENT_CANDIDATE_LIST_FULL_AADHAAR_DISCLOSED'
        );

        return response()->json(['status' => true, 'data' => $candidates]);
    }

    public function getAppointment(Request $request)
    {
        $userAuth = auth('api')->user();

        $query = User::where(function ($q) {
            // Genuine pending or approved appointments, plus legacy/untyped records that
            // haven't been assigned an emp_code yet. Once a record has both
            // a null/empty type AND an emp_code, it has already "graduated"
            // into a full employee and belongs on the Employees page only.
            $q->whereIn('type', ['appointment', 'pending_employee'])
                ->orWhere(function ($q2) {
                    $q2->where(function ($q3) {
                        $q3->whereNull('type')->orWhere('type', '');
                    })->where(function ($q4) {
                        $q4->whereNull('emp_code')->orWhere('emp_code', '');
                    });
                });
        })
            ->where(function ($q) {
                $q->where('role', '!=', 0)->orWhereNull('role');
            })
            ->with('addedBy:id,name,email,emp_code');
        HiddenAccounts::exclude($query, 'users');

        if ($userAuth && $userAuth->type === 'agent') {
            $query->where('added_by', $userAuth->id);
        } elseif ($userAuth && ((int) $userAuth->role === 1 || (int) $userAuth->role === 0)) {
            $own = array_filter(array_map('trim', explode(',', (string) $userAuth->company_code)));
            if ($request->company_code && ! in_array($request->company_code, ['all', 'all-companies'])) {
                $requested = array_filter(array_map('trim', explode(',', $request->company_code)));
                $codes = (int) $userAuth->role === 0
                    ? $requested
                    : array_intersect($requested, $own);
            } else {
                $codes = (int) $userAuth->role === 0
                    ? []
                    : $own;
            }
            if ($codes) {
                $query->whereIn('company_code', $codes);
            } elseif ((int) $userAuth->role !== 0) {
                $query->whereRaw('1 = 0');
            }
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            if (! in_array('all', $codes) && ! in_array('all-companies', $codes)) {
                $query->whereIn('company_code', $codes);
            }
        }
        if ($request->unit) {
            $query->where('unit', $request->unit);
        }

        // Search and status used to be applied in the browser, which forced this
        // endpoint to ship every matching row for the filter to mean anything.
        // Measured against a 5,000,000-row users table the unbounded query
        // returned 1,071,428 rows in 4.8 s and grew linearly; the same query
        // with LIMIT 50 answers in 1 ms and does not degrade with table size.
        if ($search = trim((string) $request->input('search', ''))) {
            $like = '%' . str_replace(['%', '_'], ['\%', '\_'], $search) . '%';
            $query->where(function ($q) use ($like) {
                foreach (['name', 'emp_code', 'mobile_number', 'unit', 'pan_card_no'] as $column) {
                    $q->orWhere($column, 'LIKE', $like);
                }
            });
        }

        $statusFilter = strtolower(trim((string) $request->input('status', '')));
        if ($statusFilter !== '' && $statusFilter !== 'all') {
            $query->where(function ($q) use ($statusFilter) {
                if ($statusFilter === 'approved') {
                    $q->whereNotNull('emp_code')->where('emp_code', '!=', '');
                } elseif ($statusFilter === 'rejected') {
                    $q->where('status', 2);
                } else {
                    $q->where(function ($q2) {
                        $q2->whereNull('emp_code')->orWhere('emp_code', '');
                    })->where(function ($q2) {
                        $q2->whereNull('status')->orWhere('status', '!=', 2);
                    });
                }
            });
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

        // Capped rather than optional. A caller that omits per_page used to get
        // the entire table; it now gets the first page, and `meta.total` tells
        // it there is more. An uncapped list endpoint is a denial-of-service
        // switch that any bookmarked URL can flip.
        $perPage = (int) $request->input('per_page', 100);
        $perPage = max(1, min($perPage, 500));

        $paginator = $query->orderBy('id', 'desc')->paginate($perPage);

        $appointments = collect($paginator->items())->map(function ($item) use ($userAuth, &$disclosed) {
            $data = $item->attributesToArray();
            $data['agent'] = $item->addedBy
                ? $item->addedBy->only(['id', 'name', 'email', 'emp_code'])
                : null;

            $full = AadhaarDisclosure::fullFor($item, $userAuth);

            if ($full !== null) {
                $data['aadhaar_full'] = $full;
                $disclosed++;
            }

            return $data;
        });

        $appointments = $this->attachAppointmentPhotos($appointments);

        // One entry for the request, with a count and no values. Auditing per row
        // would turn one page view into hundreds of inserts and bury the trail.
        AadhaarDisclosure::auditListDisclosure(
            $userAuth,
            $disclosed,
            'APPOINTMENT_LIST_FULL_AADHAAR_DISCLOSED',
            ['unit' => $request->unit]
        );

        return response()->json([
            'status' => true,
            'data' => [
                'appointments' => $appointments,
                'meta' => [
                    'total'        => $paginator->total(),
                    'per_page'     => $paginator->perPage(),
                    'current_page' => $paginator->currentPage(),
                    'last_page'    => $paginator->lastPage(),
                ],
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
            ->filter(fn ($row) => empty($row['photo']) && ! empty($row['id']))
            ->pluck('id')
            ->all();

        if (empty($missingIds)) {
            return $rows;
        }

        $documents = Document::visible()
            ->where('document_type', 'PHOTOGRAPH')
            ->whereIn('user_id', $missingIds)
            ->with('currentVersionRecord')
            ->get()
            ->keyBy('user_id');

        if ($documents->isEmpty()) {
            return $rows;
        }

        // When storage provider is S3, avoid generating presigned URLs in a loop
        // during list endpoints as 50+ sequential AWS network calls cause Gateway Timeouts.
        // The frontend fetches V1 document URLs on-demand when an item is opened.
        if (config('documents.provider') === 's3') {
            return $rows;
        }

        $service = DocumentService::make();

        return $rows->map(function ($row) use ($documents, $service) {
            $document = $documents->get($row['id'] ?? null);
            $version = $document?->currentVersionRecord;

            if (! $document || ! $version || ! $document->isReadable()) {
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
        $request->validate(['file' => 'required|file|max:10240|mimes:xlsx,xls,csv,txt']);

        $company_code = $request->company_code ?? 'nidhi-impex';
        $unit = $request->unit;
        $imported = 0;
        $skipped = [];
        $rowReports = [];

        try {
            $spreadsheet = IOFactory::load($request->file('file')->getPathname());
            $rows = $spreadsheet->getActiveSheet()->toArray();
            $header = array_shift($rows);

            foreach ($rows as $rowIndex => $row) {
                if (! array_filter($row, fn ($v) => $v !== null && $v !== '')) {
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
                    'bank_name' => $rowData['bank_name'] ?? null,
                    'bank_account_no' => $rowData['bank_account_no'] ?? null,
                    'bank_ifsc_code' => $rowData['bank_ifsc_code'] ?? null,
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
            return response()->json(['status' => false, 'message' => 'Import failed: '.$e->getMessage()], 500);
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
            \Log::error('Failed to record account-master import batch: '.$e->getMessage());
        }

        $message = "$imported records updated";
        if ($skipped) {
            $message .= '; '.count($skipped).' row(s) skipped';
        }

        return response()->json([
            'status' => true,
            'message' => $message,
            'imported' => $imported,
            'skipped' => $skipped,
            'batch_id' => $batchId,
        ]);
    }

    /**
     * Record a trial form.
     *
     * The payload is an allowlist, not the request.
     *
     * This read `$request->all()` and passed it straight into User::create.
     * User::$fillable is shared with real account creation, so `password`,
     * `status`, `is_deleted`, `emp_code` and `processed` all came from the
     * browser — and a trial record is a `users` row with role 3 that the login
     * endpoint does not filter out by type. An agent could therefore submit a
     * "trial form" carrying a password of their choosing and end up with a
     * working employee login that nobody created deliberately.
     *
     * Only the fields the trial form actually has are accepted. Identity,
     * credentials and lifecycle state are set here, from the server, every time
     * — not defaulted when the request happens to omit them.
     */
    public function postTrialForm(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'form_no' => 'nullable|unique:users,form_no',
        ], [
            'form_no.unique' => 'This Form No is already used.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => false,
                'message' => $validator->errors()->first(),
                'errors' => $validator->errors()
            ], 422);
        }

        $userAuth = auth('api')->user();

        $data = array_intersect_key(
            $request->except(self::FILE_UPLOAD_FIELDS),
            array_flip(self::TRIAL_FIELDS)
        );

        /*
         * The tenant, decided from the actor.
         *
         * The route is authenticated — jwt.auth, then role:admin,agent, then
         * recruitment.trial_form.create — so there is a real scope to check
         * against, and this checks it. Previously company_code travelled
         * straight from the body into users.company_code, which meant an agent
         * scoped to one company could file a candidate into another simply by
         * editing the request, and every later scope check would honour it.
         *
         * companyId is the canonical form and wins; company_code is still read
         * so the existing form keeps working while it is rewired.
         */
        try {
            $data['company_code'] = $this->companies->resolveCodeFor(
                $userAuth,
                $request->filled('companyId') ? (int) $request->input('companyId') : null,
                $request->input('company_code'),
            );

            $data['unit'] = $this->resolveTrialUnit($request, $data['company_code']);
        } catch (\App\Services\Provisioning\ProvisioningException $e) {
            return response()->json([
                'status' => false,
                'message' => $e->getMessage(),
                'error' => ['code' => $e->errorCode, 'message' => $e->getMessage()],
            ], $e->status);
        }

        if ($data['unit'] === null) {
            unset($data['unit']);
        }

        $data['type'] = 'trial';
        // The users.role column defaults to 1 (Admin) at the DB level, and a
        // trial-form submission never carries a role of its own — so without
        // this every trial submission silently became an Admin account instead
        // of a regular (role 3) candidate record.
        $data['role'] = 3;

        /*
         * A credential the submitter cannot choose.
         *
         * This used to generate one only when the request omitted the field,
         * which made a supplied password authoritative — the opposite of what
         * the comment claimed. There is no trial workflow that sets a password:
         * the account's owner establishes one through the OTP reset flow, so
         * this value exists solely to satisfy the NOT NULL column.
         */
        $data['password'] = bin2hex(random_bytes(16));

        // Lifecycle state belongs to the server. `processed` in particular
        // decides whether the record still appears as an open trial.
        $data['status'] = 0;
        $data['is_deleted'] = '0';
        $data['processed'] = 0;

        // Taken from the authenticated actor rather than the body: added_by is
        // what scopes an agent's list to their own submissions, so a request
        // that names someone else is a request to file under their identity.
        if ($userAuth) {
            $data['added_by'] = $userAuth->id;
        }

        $data = $this->withSafeAadhaar($data);

        if (! empty($data['form_no']) && empty($data['punching_no'])) {
            $data['punching_no'] = $data['form_no'];
        }

        $trialForm = DB::transaction(function () use ($data, $userAuth) {
            $created = User::create($data);

            // The Employee role is resolved by the server, never sent by the
            // form. A trial submission is a statement about a person, not about
            // authorization, and this record previously carried users.role = 3
            // and no canonical role at all.
            $this->provisioning->provisionEmployee($created, ProvisioningContext::TRIAL, $userAuth);

            return $created;
        });

        $files = $this->storeUploadedFiles($request, ['photo', 'adhar_image'], $trialForm);
        if (! empty($files)) {
            $trialForm->update($files);
        }

        return response()->json(['status' => true, 'message' => 'Trial form submitted']);
    }

    public function getTrialForms(Request $request)
    {
        $userAuth = auth('api')->user();

        $query = User::where('type', 'trial');

        if ($userAuth && ($userAuth->type === 'agent' || (int) $userAuth->role === 4)) {
            $query->where('added_by', $userAuth->id);
        } elseif ($userAuth && ((int) $userAuth->role === 1 || (int) $userAuth->role === 0)) {
            // Role 1 may narrow within its own companies but never outside them;
            // only role 0 is unscoped when no filter is supplied. Previously this
            // branch applied no filter at all for company_code=all/empty
            // regardless of role, so a role-1 (company-scoped) admin could see
            // every other company's trial-form applicants — including their
            // Aadhaar numbers via AadhaarDisclosure — just by passing
            // company_code=all. Found 2026-08-18 while investigating an
            // unrelated timeout report; matches the pattern already used
            // correctly by index()/getAppointment()/getAgents() in this file.
            $requested = $request->company_code && ! in_array($request->company_code, ['all', 'all-companies'])
                ? array_filter(array_map('trim', explode(',', $request->company_code)))
                : [];
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
            if (! in_array('all', $codes) && ! in_array('all-companies', $codes)) {
                $query->whereIn('company_code', $codes);
            }
        }
        if ($request->unit) {
            $query->where('unit', $request->unit);
        }

        $disclosed = 0;
        $trialForms = $query->orderBy('id', 'desc')->get();
        $trialForms->transform(function ($item) use ($userAuth, &$disclosed) {
            $full = AadhaarDisclosure::fullFor($item, $userAuth);
            if ($full) {
                $item->setAttribute('aadhaar_full', $full);
                $disclosed++;
            }

            return $item;
        });

        AadhaarDisclosure::auditListDisclosure(
            $userAuth,
            $disclosed,
            'TRIAL_FORM_LIST_FULL_AADHAAR_DISCLOSED'
        );

        return response()->json([
            'status' => true,
            'data' => $trialForms,
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
        if (! $actor) {
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
        if (! $user) {
            return response()->json(['status' => false, 'message' => 'Not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'form_no' => 'nullable|unique:users,form_no,' . $user->id,
        ], [
            'form_no.unique' => 'This Form No is already used.',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => false,
                'message' => $validator->errors()->first(),
                'errors' => $validator->errors()
            ], 422);
        }

        $data = Arr::except($request->all(), self::TRIAL_FORM_PROTECTED_FIELDS);
        $data = $this->withSafeAadhaar($data);

        if (! empty($data['form_no']) && empty($data['punching_no'])) {
            $data['punching_no'] = $data['form_no'];
        }

        $files = $this->storeUploadedFiles($request, ['photo', 'adhar_image'], $user);
        if (! empty($files)) {
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
        if (! $user) {
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
            $requested = $request->company_code && ! in_array($request->company_code, ['all', 'all-companies'])
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
            if (! in_array('all', $codes) && ! in_array('all-companies', $codes)) {
                $query->whereIn('company_code', $codes);
            }
        }

        $agents = $query->orderBy('id', 'desc')->get();

        return response()->json(['status' => true, 'data' => $agents]);
    }

    public function updateAgent($id, Request $request)
    {
        $agent = User::where('type', 'agent')->find($id);
        if (! $agent) {
            return response()->json(['status' => false, 'message' => 'Agent not found'], 404);
        }

        $validator = Validator::make($request->all(), [
            'name' => 'required',
            'email' => 'required|email|unique:users,email,'.$agent->id,
            'mobile_number' => 'required|unique:users,mobile_number,'.$agent->id,
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
        if (! $agent) {
            return response()->json(['status' => false, 'message' => 'Agent not found'], 404);
        }

        $agent->delete();

        return response()->json(['status' => true, 'message' => 'Agent deleted successfully.']);
    }
}
