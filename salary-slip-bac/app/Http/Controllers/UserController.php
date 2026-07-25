<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\SalarySlip;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Maatwebsite\Excel\Facades\Excel;

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
        'photo', 'adhar_image', 'pan_image', 'check_image',
    ];

    // Fields a logged-in user may change on their own profile via /profile-update.
    // Intentionally excludes role, company_code, unit, emp_code, is_deleted,
    // salary, bank/tax details — none of that should be self-service.
    private const SELF_PROFILE_FIELDS = [
        'name', 'email', 'mobile_number', 'dob', 'address', 'photo',
    ];

    private const PHOTO_UPLOAD_RULES = [
        'photo' => 'nullable|image|mimes:jpeg,jpg,png,webp|max:5120',
    ];

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

        $query = User::where('is_deleted', 0)
            ->where('role', '!=', 0)
            ->where(function ($q) {
                $q->whereNull('type')
                  ->orWhereNotIn('type', ['appointment', 'agent']);
            });

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
        if ($request->status !== null) {
            $query->where('status', $request->status);
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
        $validator = Validator::make($request->all(), [
            'name'     => 'required',
            'email'    => 'nullable|email|unique:users',
            'emp_code' => 'required|unique:users',
            'company_code' => 'required',
            'unit'     => in_array($request->input('role'), [0, 1, 4, '0', '1', '4'], true) ? 'nullable' : 'required',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $data = $request->all();
        $data['password'] = bcrypt($request->password ?? '12345678');
        $data['role'] = $request->role ?? 3;

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
            $data['password'] = bcrypt($data['password']);
        }

        if ($employee->type === 'appointment' && isset($data['emp_code']) && $employee->emp_code !== $data['emp_code']) {
            $data['type'] = null;
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

        $employee->update(['is_deleted' => 1]);

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
        $columns = [
            'name', 'email', 'emp_code', 'mobile_number', 'dob', 'department',
            'designation', 'salary', 'joining_date', 'gender', 'bank_name',
            'bank_account_no', 'bank_ifsc_code', 'aadhar_card_no', 'pan_card_no',
            'pf_no', 'esi_no', 'unit', 'company_code',
        ];

        return response()->json(['status' => true, 'data' => $columns]);
    }

    public function import(Request $request)
    {
        $request->validate(['file' => 'required|file']);

        $imported = 0;
        $file = $request->file('file');
        $mapping = $request->mapping ? json_decode($request->mapping, true) : [];

        try {
            $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($file->getPathname());
            $rows = $spreadsheet->getActiveSheet()->toArray();
            $header = array_shift($rows);

            foreach ($rows as $row) {
                $rowData = array_combine($header, $row);
                if ($mapping) {
                    $mapped = [];
                    foreach ($mapping as $dbField => $excelCol) {
                        $mapped[$dbField] = $rowData[$excelCol] ?? null;
                    }
                    $rowData = $mapped;
                }

                $rowData['password'] = bcrypt('12345678');
                $rowData['role'] = 3; // bulk import always onboards regular employees, never admins
                $rowData['company_code'] = $rowData['company_code'] ?? 'nidhi-impex';

                User::updateOrCreate(
                    ['emp_code' => $rowData['emp_code']],
                    $rowData
                );
                $imported++;
            }
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => 'Import failed: ' . $e->getMessage()], 500);
        }

        return response()->json(['status' => true, 'message' => "$imported employees imported"]);
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
        $request->validate(self::PHOTO_UPLOAD_RULES);

        $data = array_intersect_key($request->except(['_token', 'photo']), array_flip(self::APPOINTMENT_FIELDS));

        if ($request->hasFile('photo')) {
            $photo = $request->file('photo');
            $filename = time() . '_' . $photo->hashName();
            $photo->move(public_path('uploads/photos'), $filename);
            $data['photo'] = 'uploads/photos/' . $filename;
        }

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
            if ($employee->type === 'appointment' && isset($data['emp_code']) && $employee->emp_code !== $data['emp_code']) {
                $data['type'] = null;
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

        $data = array_intersect_key($request->except(['_token', 'photo']), array_flip(self::SELF_PROFILE_FIELDS));

        if ($request->hasFile('photo')) {
            $photo = $request->file('photo');
            $filename = time() . '_' . $photo->hashName();
            $photo->move(public_path('uploads/photos'), $filename);
            $data['photo'] = 'uploads/photos/' . $filename;
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
        $data['password'] = bcrypt($data['password']);

        $employee = User::create($data);

        return response()->json(['status' => true, 'message' => 'Agent account created successfully.', 'data' => $employee]);
    }

    public function appointmentStore(Request $request)
    {
        $raw = $request->all();
        $empCode = $raw['emp_code'] ?? null;
        $addedBy = $raw['added_by'] ?? null;
        $trialFormId = $raw['trial_form_id'] ?? null;

        // This route is unauthenticated (public job-application form), so the
        // request body must never be trusted beyond the appointment-form
        // fields below — role/is_deleted/type/password/etc are only ever set
        // by this method itself, never taken from client input.
        $data = array_intersect_key($raw, array_flip(self::APPOINTMENT_FIELDS));

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

        $data['password'] = bcrypt('12345678');
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

        try {
            $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($request->file('file')->getPathname());
            $rows = $spreadsheet->getActiveSheet()->toArray();
            $header = array_shift($rows);

            foreach ($rows as $row) {
                $rowData = array_combine($header, $row);
                if (isset($rowData['emp_code'])) {
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
                    $query->update($updateData);
                    $imported++;
                }
            }
        } catch (\Exception $e) {
            return response()->json(['status' => false, 'message' => 'Import failed: ' . $e->getMessage()], 500);
        }

        return response()->json(['status' => true, 'message' => "$imported records updated"]);
    }

    public function postTrialForm(Request $request)
    {
        $data = $request->all();
        $data['type'] = 'trial';
        
        // If password is required by DB, give a default
        if (empty($data['password'])) {
            $data['password'] = bcrypt('12345678');
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
            $data['password'] = bcrypt($request->password);
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
