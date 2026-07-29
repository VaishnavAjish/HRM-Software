<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\SalarySlip;
use App\Models\UploadBatch;
use App\Exceptions\DocumentException;
use App\Services\DocumentStorageService;
use App\Services\Documents\DocumentService;
use App\Support\DocumentType;
use Illuminate\Http\Request;
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

    private const PHOTO_UPLOAD_RULES = [
        'photo' => 'nullable|image|mimes:jpeg,jpg,png,webp|max:5120',
    ];

    // Scanned ID documents — unlike photo these may also be PDFs.
    private const DOCUMENT_UPLOAD_RULES = [
        'adhar_image' => 'nullable|file|mimes:jpeg,jpg,png,webp,pdf|max:5120',
        'pan_image'   => 'nullable|file|mimes:jpeg,jpg,png,webp,pdf|max:5120',
        'check_image'  => 'nullable|file|mimes:jpeg,jpg,png,webp,pdf|max:5120',
        'account_book' => 'nullable|file|mimes:jpeg,jpg,png,webp,pdf|max:5120',
    ];

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

        return new User([
            'emp_code' => $request->input('emp_code'),
            'name'     => $name ?: null,
        ]);
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
        // Auto-fix any legacy employees with null/empty unit
        \App\Models\User::whereNull('unit')->orWhere('unit', '')
            ->where('company_code', 'nidhi-impex')
            ->update(['unit' => 'Shreeji']);
        \App\Models\User::whereNull('unit')->orWhere('unit', '')
            ->where('company_code', 'silverstar')
            ->update(['unit' => 'Daduk']);

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
        if ($userAuth && (int) $userAuth->role === 1) {
            $query->where('company_code', $userAuth->company_code);
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            $query->whereIn('company_code', $codes);
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

        return response()->json([
            'status' => true,
            'data'   => [
                'users' => [
                    'data'         => $employees->items(),
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
        return response()->json(['status' => true, 'data' => $employee]);
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
        if (isset($data['password'])) {
            $data['password'] = $data['password'];
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

        $employee->update($data);

        return response()->json(['status' => true, 'message' => 'Employee updated', 'data' => $employee]);
    }

    public function destroy($id)
    {
        $employee = User::find($id);
        if (!$employee) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        if (!$this->inManagedScope(auth('api')->user(), $employee)) {
            return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
        }

        $employee->delete();

        return response()->json(['status' => true, 'message' => 'Employee deleted']);
    }

    public function dashboard(Request $request)
    {
        $user = auth('api')->user();

        $slips = SalarySlip::where('emp_code', $user->emp_code);

        if ($request->company_code) {
            $codes = explode(',', $request->company_code);
            $slips->whereIn('company_code', $codes);
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

    public function import(Request $request)
    {
        $imported = 0;
        $skipped = [];
        $rowReports = [];
        $companyCode = $request->company_code ?: null;
        $unit = $request->unit ?: null;

        if ($request->has('rows')) {
            $rowsData = $request->input('rows', []);
            if (is_string($rowsData)) {
                $rowsData = json_decode($rowsData, true) ?? [];
            }
            if (!is_array($rowsData)) {
                $rowsData = [];
            }

            foreach ($rowsData as $rowIndex => $rowData) {
                $excelRowNum = $rowIndex + 2;

                $rowData['role'] = 3;
                $rowData['company_code'] = $rowData['company_code'] ?? $companyCode ?? 'nidhi-impex';
                if ($unit && empty($rowData['unit'])) {
                    $rowData['unit'] = $unit;
                }

                $empCode = trim((string) ($rowData['emp_code'] ?? ''));
                if ($empCode === '') {
                    $reason = 'Missing employee code';
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                    continue;
                }
                $rowData['emp_code'] = $empCode;

                $existing = User::where('emp_code', $empCode)->where('company_code', $rowData['company_code'])->where('is_deleted', 0)->exists();
                if ($existing) {
                    $reason = "Employee code '{$empCode}' already exists in the system";
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                    continue;
                }

                $email = trim((string) ($rowData['email'] ?? ''));
                if ($email !== '' && User::where('email', $email)->where('is_deleted', 0)->exists()) {
                    $reason = "Email '{$email}' is already used by another employee";
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                    continue;
                }

                $providedPassword = $rowData['password'] ?? '';
                $rowData['password'] = $providedPassword !== '' ? $providedPassword : '12345678';
                $rowData['status'] = 2;

                try {
                    User::create($rowData);
                    $imported++;
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'passed', 'reason' => null, 'row_data' => $rowData];
                } catch (\Throwable $rowError) {
                    $reason = $this->friendlyImportError($rowError);
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                }
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

                    $excelRowNum = $rowIndex + 2;

                    $row = array_slice(array_pad($row, count($header), null), 0, count($header));
                    $rowData = array_combine($header, $row);
                    if ($mapping) {
                        $mapped = [];
                        foreach ($mapping as $dbField => $excelCol) {
                            $mapped[$dbField] = $rowData[$excelCol] ?? null;
                        }
                        $rowData = $mapped;
                    }

                    $rowData['role'] = 3;
                    $rowData['company_code'] = $rowData['company_code'] ?? $companyCode ?? 'nidhi-impex';
                    if ($unit && empty($rowData['unit'])) {
                        $rowData['unit'] = $unit;
                    }

                    $empCode = trim((string) ($rowData['emp_code'] ?? ''));
                    if ($empCode === '') {
                        $reason = 'Missing employee code';
                        $skipped[] = "Row {$excelRowNum}: {$reason}";
                        $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                        continue;
                    }

                    $rowData['emp_code'] = $empCode;

                    if (!User::where('emp_code', $empCode)->where('is_deleted', 0)->exists()) {
                        $providedPassword = $rowData['password'] ?? '';
                        $rowData['password'] = $providedPassword !== '' ? $providedPassword : '12345678';
                        $rowData['status'] = 2;
                    } else {
                        unset($rowData['password'], $rowData['status']);
                    }

                    $existing = User::where('emp_code', $empCode)->where('company_code', $rowData['company_code'] ?? 'nidhi-impex')->where('is_deleted', 0)->exists();
                    if ($existing) {
                        $reason = "Employee code '{$empCode}' already exists in the system";
                        $skipped[] = "Row {$excelRowNum}: {$reason}";
                        $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                        continue;
                    }

                    $email = trim((string) ($rowData['email'] ?? ''));
                    if ($email !== '' && User::where('email', $email)->where('is_deleted', 0)->exists()) {
                        $reason = "Email '{$email}' is already used by another employee";
                        $skipped[] = "Row {$excelRowNum}: {$reason}";
                        $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                        continue;
                    }

                    try {
                        User::create($rowData);
                        $imported++;
                        $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'passed', 'reason' => null, 'row_data' => $rowData];
                    } catch (\Throwable $rowError) {
                        $reason = $this->friendlyImportError($rowError);
                        $skipped[] = "Row {$excelRowNum}: {$reason}";
                        $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $rowData];
                    }
                }
            } catch (\Throwable $e) {
                return response()->json(['status' => false, 'message' => 'Import failed: ' . $e->getMessage()], 500);
            }

            $fileName = $file->getClientOriginalName();
        }

        $batchId = null;
        try {
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
        } catch (\Throwable $e) {
            \Log::error('Failed to record employee import batch: ' . $e->getMessage());
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
        $request->validate(array_merge(self::PHOTO_UPLOAD_RULES, self::DOCUMENT_UPLOAD_RULES));

        // Every file field is excluded from the raw input and re-added below as
        // a stored path, so no UploadedFile can be mass-assigned as a temp path.
        $data = array_intersect_key(
            $request->except(array_merge(['_token'], self::FILE_UPLOAD_FIELDS)),
            array_flip(self::APPOINTMENT_FIELDS)
        );

        $data = array_merge($data, $this->storeUploadedFiles($request, self::APPOINTMENT_FIELDS, $this->resolveDocumentOwner($request)));

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
                if ($employee->type === 'appointment' || $employee->type === 'pending_employee') {
                    $data['type'] = null;
                }
            }
            if ($request->has('checkbox')) {
                $data['checkbox'] = $request->checkbox;
                if ($request->checkbox == 1 && $employee->type === 'appointment') {
                    $data['type'] = 'pending_employee';
                    $data['status'] = 2; // Pending status
                } elseif ($request->checkbox == 0 && ($employee->type === 'pending_employee' || $employee->type === 'appointment')) {
                    $data['type'] = 'appointment';
                }
            }
            $employee->update($data);
            return response()->json(['status' => true, 'message' => 'Employee updated', 'user' => $employee->fresh()]);
        }

        $empCode = $request->emp_code;
        if ($empCode) {
            $employee = User::where('emp_code', $empCode)->first();
            if ($employee) {
                if (!$this->inManagedScope($userAuth, $employee)) {
                    return response()->json(['status' => false, 'message' => 'Employee not found'], 404);
                }
                $employee->update($data);
                return response()->json(['status' => true, 'message' => 'Employee updated', 'user' => $employee->fresh()]);
            }
        }

        if ($userAuth) {
            $userAuth->update($data);
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

        $rules = array_merge(self::PHOTO_UPLOAD_RULES, [
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
        $request->validate(array_merge(self::PHOTO_UPLOAD_RULES, self::DOCUMENT_UPLOAD_RULES));

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

        // Resolve the source trial form once. Converting it into an appointment
        // creates a brand-new users row, and users.email has a hard uniqueness
        // constraint at the database level — a validation exemption alone isn't
        // enough, the trial row's email must actually be freed first, or the
        // insert below still fails with a DB-level constraint violation.
        $trialForm = $trialFormId
            ? User::where('id', $trialFormId)->where('type', 'trial')->first()
            : null;
        if ($trialForm && $trialForm->email && $trialForm->email === ($data['email'] ?? null)) {
            $trialForm->update(['email' => null]);
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
                $q->where('type', '!=', 'trial')->orWhere('processed', 0);
            });
        $candidates = $query->orderBy('id', 'desc')->get();
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
        } elseif ($userAuth && (int) $userAuth->role === 1) {
            $query->where('company_code', $userAuth->company_code);
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            $query->whereIn('company_code', $codes);
        }
        if ($request->unit) {
            $query->where('unit', $request->unit);
        }

        $appointments = $query->orderBy('id', 'desc')->get()->map(function ($item) {
            $data = $item->attributesToArray();
            $data['agent'] = $item->addedBy
                ? $item->addedBy->only(['id', 'name', 'email', 'emp_code'])
                : null;
            return $data;
        });

        return response()->json([
            'status' => true,
            'data'   => [
                'appointments' => $appointments,
            ],
        ]);
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
        
        $trialForm = User::create($data);

        return response()->json(['status' => true, 'message' => 'Trial form submitted']);
    }

    public function getTrialForms(Request $request)
    {
        $userAuth = auth('api')->user();

        $query = User::where('type', 'trial')->where('processed', 0);

        if ($userAuth && (int) $userAuth->role === 1) {
            $query->where('company_code', $userAuth->company_code);
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            $query->whereIn('company_code', $codes);
        }
        if ($request->unit) {
            $query->where('unit', $request->unit);
        }

        return response()->json([
            'status' => true,
            'data'   => $query->orderBy('id', 'desc')->get(),
        ]);
    }

    public function updateTrialForm($id, Request $request)
    {
        $user = User::find($id);
        if (!$user) {
            return response()->json(['status' => false, 'message' => 'Not found'], 404);
        }

        $user->update($request->all());

        return response()->json(['status' => true, 'message' => 'Trial form updated']);
    }

    public function deleteTrialForm($id)
    {
        $user = User::find($id);
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
        
        if ($userAuth && (int) $userAuth->role === 1) {
            $query->where('company_code', $userAuth->company_code);
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            $query->whereIn('company_code', $codes);
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
