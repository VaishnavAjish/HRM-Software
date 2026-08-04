<?php

namespace App\Http\Controllers\Api\V1\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Admin\StoreUserRequest;
use App\Http\Requests\Admin\UpdateUserRequest;
use App\Models\User;
use App\Services\Admin\UserAccountService;
use App\Services\Admin\UserDirectory;
use App\Services\Authorization\SchemaSupport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\StreamedResponse;

class UserController extends Controller
{
    private const EXPORT_COLUMNS = [
        'empCode' => 'Employee ID',
        'name' => 'Full Name',
        'username' => 'Username',
        'email' => 'Email',
        'mobile' => 'Mobile',
        'department' => 'Department',
        'designation' => 'Designation',
        'branch' => 'Branch',
        'unit' => 'Unit',
        'companyCode' => 'Company',
        'roleLabel' => 'Role',
        'userTypeLabel' => 'User Type',
        'status' => 'Status',
        'lastLoginAt' => 'Last Login',
        'createdAt' => 'Created Date',
    ];

    private const BULK_ACTIONS = ['activate', 'deactivate', 'lock', 'unlock', 'delete', 'assign-role'];

    /**
     * A cell that begins with a formula trigger character is interpreted as
     * an expression by spreadsheet applications, so a value planted in the
     * database (name, department, ...) could run a formula/DDE payload in
     * whoever's machine opens the export. Neutralise those cells by prefixing
     * them with a single quote so they are read as literal text.
     */
    private static function sanitizeCsvCell(string $value): string
    {
        if (in_array($value[0] ?? '', ['=', '+', '-', '@', "\t", "\r"], true)) {
            return "'".$value;
        }

        return $value;
    }

    public function __construct(
        private readonly UserDirectory $directory,
        private readonly UserAccountService $accounts,
    ) {}

    public function index(Request $request)
    {
        $actor = auth('api')->user();
        $filters = $this->filters($request);
        $page = $this->directory->paginate($actor, $filters);

        return response()->json([
            'success' => true,
            'data' => $page['rows'],
            'meta' => [
                'page' => $page['page'],
                'perPage' => $page['perPage'],
                'total' => $page['total'],
                'lastPage' => $page['lastPage'],
                'administrationReady' => $this->directory->supportsAdministration(),
                'includesSuperAdmins' => $this->directory->includesSuperAdmins($filters),
            ],
            'summary' => $this->directory->summary($actor, $filters),
        ]);
    }

    public function summary(Request $request)
    {
        return response()->json([
            'success' => true,
            'data' => $this->directory->summary(auth('api')->user(), $this->filters($request)),
        ]);
    }

    public function filterOptions()
    {
        return response()->json([
            'success' => true,
            'data' => $this->directory->filterOptions(auth('api')->user()),
        ]);
    }

    public function show(int $id)
    {
        $actor = auth('api')->user();
        $user = User::query()->find($id);

        if (! $user || ($this->isConcealed($actor, $user))) {
            return $this->error('NOT_FOUND', 'User not found.', 404);
        }

        if (! $this->directory->scopeAllows($actor, $user)) {
            return $this->error('PERMISSION_DENIED', 'That user is outside the companies you administer.', 403);
        }

        $row = DB::table('users')->where('id', $id)->first($this->directory->selectColumns());

        return response()->json([
            'success' => true,
            'data' => array_merge($this->directory->serialize($row, $this->directory->rolesFor([$id])[$id] ?? []), [
                'personal' => [
                    'dob' => $user->dob,
                    'gender' => $user->gender,
                    'bloodGroup' => $user->blood_group,
                    'maritalStatus' => $user->marital_status,
                    'address' => $user->address,
                    'city' => $user->city,
                    'district' => $user->district,
                    'state' => $user->state,
                    'pin' => $user->pin,
                    'aadhaarMasked' => $user->aadhaar_masked,
                    'panCardNo' => $user->pan_card_no,
                ],
                'employment' => [
                    'joiningDate' => $user->joining_date,
                    'resignationDate' => $user->resignation_date,
                    'department' => $user->department,
                    'designation' => $user->designation,
                    'branch' => $user->branch,
                    'unit' => $user->unit,
                    'companyCode' => $user->company_code,
                    'pfNo' => $user->pf_no,
                    'esiNo' => $user->esi_no,
                    'punchingNo' => $user->punching_no,
                    'shiftId' => $user->shift_id,
                ],
                'departments' => $this->departmentsOf($user),
                'branches' => $this->branchesOf($user),
                'reportingManager' => $this->reportingManager($user),
                'permissions' => $this->effectivePermissions($user),
                'directPermissions' => $this->accounts->directPermissionsOf($user),
                'loginHistory' => $this->accounts->loginHistory($user),
                'auditHistory' => $this->accounts->history($user),
                'recentActivity' => $this->accounts->activity($user),
            ]),
        ]);
    }

    public function store(StoreUserRequest $request)
    {
        $actor = auth('api')->user();
        $data = $request->payload();

        if ($guard = $this->guardTargetRole($actor, (int) $data['role'])) {
            return $guard;
        }

        if ($guard = $this->guardCompany($actor, $data['company_code'])) {
            return $guard;
        }

        return response()->json([
            'success' => true,
            'data' => ['id' => $this->accounts->create($data, $actor)->id],
        ], 201);
    }

    public function update(UpdateUserRequest $request, int $id)
    {
        $actor = auth('api')->user();
        $user = User::query()->find($id);

        if (! $user) {
            return $this->error('NOT_FOUND', 'User not found.', 404);
        }

        if ($guard = $this->guardTarget($actor, $user)) {
            return $guard;
        }

        $data = $request->payload();

        if (array_key_exists('role', $data) && ($guard = $this->guardTargetRole($actor, (int) $data['role']))) {
            return $guard;
        }

        if (array_key_exists('company_code', $data) && ($guard = $this->guardCompany($actor, $data['company_code']))) {
            return $guard;
        }

        $this->accounts->update($user, $data, $actor);

        return response()->json(['success' => true, 'data' => ['id' => $user->id]]);
    }

    public function destroy(Request $request, int $id)
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:1000']]);

        $actor = auth('api')->user();
        $user = User::query()->find($id);

        if (! $user) {
            return $this->error('NOT_FOUND', 'User not found.', 404);
        }

        if ($guard = $this->guardTarget($actor, $user, true)) {
            return $guard;
        }

        $this->accounts->softDelete($user, $actor, $data['reason'] ?? null);

        return response()->json(['success' => true, 'data' => ['id' => $user->id]]);
    }

    public function lock(Request $request, int $id)
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:1000']]);

        return $this->stateChange($id, true, fn (User $user, User $actor) => $this->accounts->lock($user, $actor, $data['reason']));
    }

    public function unlock(Request $request, int $id)
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:1000']]);

        return $this->stateChange($id, false, fn (User $user, User $actor) => $this->accounts->unlock($user, $actor, $data['reason']));
    }

    public function activate(Request $request, int $id)
    {
        $data = $request->validate(['reason' => ['nullable', 'string', 'max:1000']]);

        return $this->stateChange($id, false, fn (User $user, User $actor) => $this->accounts->activate($user, $actor, $data['reason'] ?? null));
    }

    public function deactivate(Request $request, int $id)
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:5', 'max:1000']]);

        return $this->stateChange($id, true, fn (User $user, User $actor) => $this->accounts->deactivate($user, $actor, $data['reason']));
    }

    public function resetPassword(Request $request, int $id)
    {
        $data = $request->validate([
            'password' => ['nullable', 'string', 'min:8', 'max:128'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $actor = auth('api')->user();
        $user = User::query()->find($id);

        if (! $user) {
            return $this->error('NOT_FOUND', 'User not found.', 404);
        }

        if ($guard = $this->guardTarget($actor, $user)) {
            return $guard;
        }

        $issued = $this->accounts->resetPassword($user, $actor, $data['password'] ?? null, $data['reason'] ?? null);

        return response()->json([
            'success' => true,
            'data' => [
                'id' => $user->id,
                'temporaryPassword' => empty($data['password']) ? $issued : null,
            ],
        ]);
    }

    public function assignRole(Request $request, int $id)
    {
        $data = $request->validate([
            'roleIds' => ['present', 'array', 'max:20'],
            'roleIds.*' => ['integer', 'exists:roles,id'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $actor = auth('api')->user();
        $user = User::query()->find($id);

        if (! $user) {
            return $this->error('NOT_FOUND', 'User not found.', 404);
        }

        if ($guard = $this->guardTarget($actor, $user)) {
            return $guard;
        }

        if ($guard = $this->guardSensitiveRoles($actor, $data['roleIds'])) {
            return $guard;
        }

        return response()->json([
            'success' => true,
            'data' => ['roleIds' => $this->accounts->assignRoles($user, $data['roleIds'], $actor, $data['reason'] ?? null)],
        ]);
    }

    public function assignPermissions(Request $request, int $id)
    {
        $data = $request->validate([
            'permissions' => ['present', 'array', 'max:200'],
            'permissions.*.permissionId' => ['required', 'integer', 'exists:permissions,id'],
            'permissions.*.isDenied' => ['nullable', 'boolean'],
            'reason' => ['nullable', 'string', 'max:1000'],
        ]);

        $actor = auth('api')->user();
        $user = User::query()->find($id);

        if (! $user) {
            return $this->error('NOT_FOUND', 'User not found.', 404);
        }

        if ($guard = $this->guardTarget($actor, $user)) {
            return $guard;
        }

        return response()->json([
            'success' => true,
            'data' => ['permissions' => $this->accounts->assignPermissions($user, $data['permissions'], $actor, $data['reason'] ?? null)],
        ]);
    }

    public function auditLogs(Request $request, int $id)
    {
        $actor = auth('api')->user();
        $user = User::query()->find($id);

        if (! $user || $this->isConcealed($actor, $user)) {
            return $this->error('NOT_FOUND', 'User not found.', 404);
        }

        if (! $this->directory->scopeAllows($actor, $user)) {
            return $this->error('PERMISSION_DENIED', 'That user is outside the companies you administer.', 403);
        }

        $limit = min(100, max(1, (int) $request->input('limit', 50)));

        return response()->json([
            'success' => true,
            'data' => [
                'auditHistory' => $this->accounts->history($user, $limit),
                'recentActivity' => $this->accounts->activity($user, $limit),
                'loginHistory' => $this->accounts->loginHistory($user, $limit),
            ],
        ]);
    }

    public function bulk(Request $request)
    {
        $data = $request->validate([
            'action' => ['required', 'string', 'in:'.implode(',', self::BULK_ACTIONS)],
            'userIds' => ['required', 'array', 'min:1', 'max:500'],
            'userIds.*' => ['integer'],
            'reason' => ['nullable', 'string', 'max:1000'],
            'roleIds' => ['nullable', 'array', 'max:20'],
            'roleIds.*' => ['integer', 'exists:roles,id'],
        ]);

        if (in_array($data['action'], ['lock', 'deactivate'], true) && strlen(trim((string) ($data['reason'] ?? ''))) < 5) {
            return $this->error('VALIDATION_FAILED', 'A reason of at least 5 characters is required for this action.', 422);
        }

        if ($data['action'] === 'assign-role' && ! array_key_exists('roleIds', $data)) {
            return $this->error('VALIDATION_FAILED', 'roleIds is required when assigning roles.', 422);
        }

        $actor = auth('api')->user();
        $reason = $data['reason'] ?? null;
        $applied = [];
        $skipped = [];

        foreach (array_unique($data['userIds']) as $userId) {
            $user = User::query()->find($userId);

            if (! $user) {
                $skipped[] = ['id' => $userId, 'reason' => 'Not found'];

                continue;
            }

            $destructive = in_array($data['action'], ['lock', 'deactivate', 'delete'], true);

            if ($this->guardTarget($actor, $user, $data['action'] === 'delete', $destructive)) {
                $skipped[] = ['id' => $userId, 'reason' => 'Not permitted'];

                continue;
            }

            match ($data['action']) {
                'activate' => $this->accounts->activate($user, $actor, $reason),
                'deactivate' => $this->accounts->deactivate($user, $actor, (string) $reason),
                'lock' => $this->accounts->lock($user, $actor, (string) $reason),
                'unlock' => $this->accounts->unlock($user, $actor, (string) ($reason ?: 'Bulk unlock')),
                'delete' => $this->accounts->softDelete($user, $actor, $reason),
                'assign-role' => $this->accounts->assignRoles($user, $data['roleIds'] ?? [], $actor, $reason),
            };

            $applied[] = (int) $userId;
        }

        return response()->json(['success' => true, 'data' => ['applied' => $applied, 'skipped' => $skipped]]);
    }

    public function export(Request $request): StreamedResponse
    {
        $rows = $this->directory->export(auth('api')->user(), $this->filters($request));
        $format = strtolower((string) $request->input('format', 'csv'));
        $extension = in_array($format, ['excel', 'xls'], true) ? 'xls' : 'csv';

        $callback = function () use ($rows, $extension) {
            $handle = fopen('php://output', 'w');

            if ($extension === 'csv') {
                fwrite($handle, "\xEF\xBB\xBF");
                fputcsv($handle, array_values(self::EXPORT_COLUMNS));

                foreach ($rows as $row) {
                    fputcsv($handle, array_map(
                        static fn (string $key) => self::sanitizeCsvCell((string) ($row[$key] ?? '')),
                        array_keys(self::EXPORT_COLUMNS)
                    ));
                }

                fclose($handle);

                return;
            }

            fwrite($handle, '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr>');

            foreach (self::EXPORT_COLUMNS as $label) {
                fwrite($handle, '<th>'.htmlspecialchars($label, ENT_QUOTES).'</th>');
            }

            fwrite($handle, '</tr>');

            foreach ($rows as $row) {
                fwrite($handle, '<tr>');

                foreach (array_keys(self::EXPORT_COLUMNS) as $key) {
                    fwrite($handle, '<td>'.htmlspecialchars((string) ($row[$key] ?? ''), ENT_QUOTES).'</td>');
                }

                fwrite($handle, '</tr>');
            }

            fwrite($handle, '</table></body></html>');
            fclose($handle);
        };

        return response()->streamDownload(
            $callback,
            'access-control-users-'.now()->format('Ymd-His').'.'.$extension,
            [
                'Content-Type' => $extension === 'csv'
                    ? 'text/csv; charset=UTF-8'
                    : 'application/vnd.ms-excel; charset=UTF-8',
            ]
        );
    }

    private function stateChange(int $id, bool $destructive, callable $apply)
    {
        $actor = auth('api')->user();
        $user = User::query()->find($id);

        if (! $user) {
            return $this->error('NOT_FOUND', 'User not found.', 404);
        }

        if ($guard = $this->guardTarget($actor, $user, false, $destructive)) {
            return $guard;
        }

        if (! $this->directory->supportsAdministration()) {
            return $this->error('MODULE_SCHEMA_NOT_READY', 'User administration columns are not present in this database yet.', 503);
        }

        $apply($user, $actor);

        return response()->json(['success' => true, 'data' => ['id' => $user->id]]);
    }

    private function guardTarget(User $actor, User $target, bool $isDelete = false, bool $destructive = false)
    {
        // A hidden or protected account is not addressable by anyone but a super
        // admin. 404 rather than 403 so the response cannot confirm the account
        // exists to a probe iterating ids.
        if (($target->isHidden() || $target->isProtected()) && ! $actor->isSuperAdmin()) {
            return $this->error('NOT_FOUND', 'User not found.', 404);
        }

        if (! $this->directory->scopeAllows($actor, $target)) {
            return $this->error('PERMISSION_DENIED', 'That user is outside the companies you administer.', 403);
        }

        if ((int) $target->role === 0 && (int) $actor->role !== 0) {
            return $this->error('PERMISSION_DENIED', 'Only a super administrator may change a super administrator.', 403);
        }

        if (($isDelete || $destructive) && (int) $target->id === (int) $actor->id) {
            return $this->error('VALIDATION_FAILED', 'You cannot apply this action to your own account.', 422);
        }

        return null;
    }

    private function guardTargetRole(User $actor, int $role)
    {
        if ($role === 0 && (int) $actor->role !== 0) {
            return $this->error('PERMISSION_DENIED', 'Only a super administrator may grant super administrator access.', 403);
        }

        return null;
    }

    private function guardCompany(User $actor, string $companyCode)
    {
        if ((int) $actor->role === 0) {
            return null;
        }

        $codes = array_values(array_filter(array_map('trim', explode(',', (string) $actor->company_code))));

        if ($codes && ! in_array($companyCode, $codes, true)) {
            return $this->error('PERMISSION_DENIED', 'That company is outside the companies you administer.', 403);
        }

        return null;
    }

    private function guardSensitiveRoles(User $actor, array $roleIds)
    {
        if ((int) $actor->role === 0 || ! $roleIds || ! SchemaSupport::hasColumn('roles', 'code')) {
            return null;
        }

        $blocked = DB::table('roles')
            ->whereIn('id', $roleIds)
            ->whereIn('code', ['super_administrator', 'security_administrator'])
            ->exists();

        return $blocked
            ? $this->error('PERMISSION_DENIED', 'Only a super administrator may assign that role.', 403)
            : null;
    }

    private function filters(Request $request): array
    {
        return [
            'search' => $request->query('search'),
            'name' => $request->query('name'),
            'empCode' => $request->query('empCode'),
            'email' => $request->query('email'),
            'mobile' => $request->query('mobile'),
            'username' => $request->query('username'),
            'department' => $request->query('department'),
            'designation' => $request->query('designation'),
            'branch' => $request->query('branch'),
            'unit' => $request->query('unit'),
            'companyCode' => $request->query('company_code') ?? $request->query('companyCode'),
            'roleId' => $request->query('roleId'),
            'status' => $request->query('status'),
            'userType' => $request->query('userType'),
            'includeSuperAdmins' => $request->query('includeSuperAdmins'),
            'createdFrom' => $request->query('createdFrom'),
            'createdTo' => $request->query('createdTo'),
            'sortBy' => $request->query('sortBy'),
            'sortDir' => $request->query('sortDir'),
            'page' => $request->query('page'),
            'perPage' => $request->query('perPage'),
        ];
    }

    private function departmentsOf(User $user): array
    {
        $names = array_values(array_filter([$user->department, $user->hastak_department]));

        if (! $names || ! SchemaSupport::hasTable('departments')) {
            return array_map(static fn ($name) => ['id' => null, 'name' => $name], $names);
        }

        $known = DB::table('departments')->whereIn('name', $names)->get(['id', 'name']);

        return array_merge(
            $known->map(static fn ($row) => ['id' => (int) $row->id, 'name' => $row->name])->all(),
            array_map(
                static fn ($name) => ['id' => null, 'name' => $name],
                array_values(array_diff($names, $known->pluck('name')->all()))
            )
        );
    }

    private function branchesOf(User $user): array
    {
        $out = [];

        if ($user->branch) {
            $out[] = ['id' => null, 'name' => $user->branch, 'source' => 'user'];
        }

        if ($user->unit) {
            $out[] = ['id' => null, 'name' => $user->unit, 'source' => 'unit'];
        }

        if ($user->branch && SchemaSupport::hasTable('organization_units')) {
            $unit = DB::table('organization_units')->where('name', $user->branch)->first(['id', 'name', 'unit_type']);

            if ($unit) {
                $out[0] = ['id' => (int) $unit->id, 'name' => $unit->name, 'source' => $unit->unit_type];
            }
        }

        return $out;
    }

    private function reportingManager(User $user): ?array
    {
        if (SchemaSupport::hasTable('reporting_relationships')) {
            $row = DB::table('reporting_relationships as r')
                ->join('users as m', 'm.id', '=', 'r.manager_user_id')
                ->where('r.employee_user_id', $user->id)
                ->where('r.status', 'ACTIVE')
                ->orderByDesc('r.effective_from')
                ->first(['m.id', 'm.name', 'm.emp_code', 'm.email', 'r.relationship_type']);

            if ($row) {
                return [
                    'id' => (int) $row->id,
                    'name' => $row->name,
                    'empCode' => $row->emp_code,
                    'email' => $row->email,
                    'relationshipType' => $row->relationship_type,
                ];
            }
        }

        if (! $user->manager_name) {
            return null;
        }

        return [
            'id' => null,
            'name' => $user->manager_name,
            'empCode' => null,
            'email' => null,
            'relationshipType' => 'RECORDED_NAME',
        ];
    }

    private function effectivePermissions(User $user): array
    {
        if (! SchemaSupport::hasTable('role_permissions') || ! SchemaSupport::hasTable('user_roles')) {
            return [];
        }

        $hasEffect = SchemaSupport::hasColumn('role_permissions', 'effect');
        $columns = ['permissions.id', 'permissions.name', 'roles.name as role_name'];

        if ($hasEffect) {
            $columns[] = 'role_permissions.effect';
        }

        $rows = DB::table('user_roles')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->join('role_permissions', 'role_permissions.role_id', '=', 'roles.id')
            ->join('permissions', 'permissions.id', '=', 'role_permissions.permission_id')
            ->where('user_roles.user_id', $user->id)
            ->orderBy('permissions.name')
            ->limit(1000)
            ->get($columns);

        $effective = [];

        foreach ($rows as $row) {
            if (($effective[$row->name]['effect'] ?? null) === 'DENY') {
                continue;
            }

            $effective[$row->name] = [
                'permissionId' => (int) $row->id,
                'code' => $row->name,
                'effect' => $hasEffect ? ($row->effect ?: 'ALLOW') : 'ALLOW',
                'source' => $row->role_name,
            ];
        }

        foreach ($this->accounts->directPermissionsOf($user) as $direct) {
            $effective[$direct['code']] = [
                'permissionId' => $direct['permissionId'],
                'code' => $direct['code'],
                'effect' => $direct['isDenied'] ? 'DENY' : 'ALLOW',
                'source' => 'Direct grant',
            ];
        }

        ksort($effective);

        return array_values($effective);
    }

    private function isConcealed(User $actor, User $target): bool
    {
        return ($target->isHidden() || $target->isProtected()) && ! $actor->isSuperAdmin();
    }

    private function error(string $code, string $message, int $status)
    {
        return response()->json([
            'success' => false,
            'error' => ['code' => $code, 'message' => $message],
        ], $status);
    }
}
