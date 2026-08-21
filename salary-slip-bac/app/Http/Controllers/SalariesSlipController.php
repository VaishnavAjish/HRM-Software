<?php

namespace App\Http\Controllers;

use App\Http\Controllers\Admin\Hr\Concerns\ScopesCompany;
use App\Models\SalarySlip;
use App\Support\UserTypeRoles;
use Illuminate\Http\Request;

class SalariesSlipController extends Controller
{
    use ScopesCompany;

    private function canManageOrViewAllSalaries($user): bool
    {
        if (!$user) {
            return false;
        }

        // 1. Check legacy integer role (0 = SuperAdmin, 1 = Admin, 2 = UnitAdmin)
        $legacyRole = (int) $user->role;
        if (in_array($legacyRole, [0, 1, 2], true)) {
            return true;
        }

        // 2. Check if user is an agent (agents never manage salary slips unless explicitly granted)
        if ($user->type === 'agent') {
            $hasAdminRole = $user->roles()->whereIn('code', [
                'tenant_administrator', 'admin', 'hr_manager', 'hr', 'hr_admin',
                'account_manager', 'accountant', 'account', 'accounts', 'payroll_manager', 'payroll_admin'
            ])->exists();
            if (!$hasAdminRole) {
                return false;
            }
        }

        // 3. Check assigned roles / role tier via UserTypeRoles or user_roles relationship
        $assignedRoleCodes = $user->roles()->pluck('code')->toArray();
        if ($user->role) {
            $assignedRoleCodes[] = (string) $user->role;
        }

        foreach ($assignedRoleCodes as $code) {
            $tier = UserTypeRoles::tierForCode($code);
            if (in_array($tier, [UserTypeRoles::SUPER_ADMIN, UserTypeRoles::ADMIN, UserTypeRoles::UNIT_ADMIN], true)) {
                return true;
            }
            if (in_array(strtolower($code), [
                'account_manager', 'accountant', 'account', 'accounts', 'accounts_head',
                'accounts_manager', 'payroll_manager', 'payroll_admin', 'hr', 'hr_manager', 'hr_admin'
            ], true)) {
                return true;
            }
        }

        // 4. Check RBAC permissions evaluated by AuthorizationEngine
        try {
            $engine = app(\App\Services\Authorization\AuthorizationEngine::class);
            $permissionsToCheck = [
                'ui.salary',
                'ui.salary.batch',
                'ui.salary.upload',
                'payroll.payslip.read',
                'payroll.payslip.create',
                'payroll.payslip.update',
                'payroll.payslip.delete',
                'payroll.run.execute',
                'payroll.run.approve',
                'payroll.run.export',
                'salary.batch.read',
                'salary.slip.read',
            ];

            foreach ($permissionsToCheck as $perm) {
                if ($engine->decide($user, $perm, [], ['audit' => false])->allowed) {
                    return true;
                }
            }
        } catch (\Throwable $e) {
            // Ignore engine resolution error
        }

        return false;
    }

    public function index(Request $request)
    {
        $query = SalarySlip::query();

        // resignation_date is the employee's last working day (see
        // ExitManagementController::store). Once it has passed, exclude
        // their slips from the salary download list entirely.
        $query->where(function ($q) {
            $q->whereNull('emp_code')
                ->orWhereNotIn('emp_code', function ($sub) {
                    $sub->select('emp_code')
                        ->from('users')
                        ->whereNotNull('emp_code')
                        ->whereNotNull('resignation_date')
                        ->whereDate('resignation_date', '<=', now()->toDateString());
                });
        });

        $user = auth('api')->user();
        if ($user && !$this->canManageOrViewAllSalaries($user)) {
            // Non-admins / self-service employees may only ever see their own salary slips, regardless
            // of what emp_code (or lack of one) the client requests.
            $query->where('emp_code', $user->emp_code);
        } else {
            $this->applyCompanyScope($query, $request);
            if ($request->emp_code) {
                $query->where('emp_code', $request->emp_code);
            }
        }
        if ($request->unit) {
            $query->where('unit', $request->unit);
        }
        if ($request->month) {
            $query->where('month', $request->month);
        }
        if ($request->year) {
            $query->where('year', $request->year);
        }
        if ($request->department) {
            $query->where('department', $request->department);
        }
        if ($request->search) {
            $query->where(function ($q) use ($request) {
                $q->where('emp_name', 'like', "%{$request->search}%")
                  ->orWhere('emp_code', 'like', "%{$request->search}%");
            });
        }

        $perPage = $request->limit ?? 15;

        if ($request->no_pagination) {
            return response()->json(['status' => true, 'data' => $query->orderBy('id', 'desc')->get()]);
        }

        $totalNetPayable = (float) (clone $query)->sum('net_payable');
        $totalDepartments = (int) (clone $query)->whereNotNull('department')->where('department', '!=', '')->distinct()->count('department');

        $slips = $query->orderBy('id', 'desc')->paginate($perPage);

        return response()->json([
            'status' => true,
            'data'   => $slips->items(),
            'total_net_payable' => $totalNetPayable,
            'total_departments' => $totalDepartments,
            'pagination' => [
                'total'        => $slips->total(),
                'per_page'     => $slips->perPage(),
                'current_page' => $slips->currentPage(),
                'last_page'    => $slips->lastPage(),
            ],
        ]);
    }

    public function show($id, Request $request)
    {
        $slip = SalarySlip::find($id);
        if (!$slip) {
            return response()->json(['status' => false, 'message' => 'Salary slip not found'], 404);
        }

        $user = auth('api')->user();
        if ($user) {
            if (!$this->canManageOrViewAllSalaries($user) && (string) $slip->emp_code !== (string) $user->emp_code) {
                return response()->json(['status' => false, 'message' => 'Salary slip not found'], 404);
            }
            if ((int) $user->role === 1 && (string) $slip->company_code !== (string) $user->company_code) {
                return response()->json(['status' => false, 'message' => 'Salary slip not found'], 404);
            }
            if ((int) $user->role === 2 && ((string) $slip->company_code !== (string) $user->company_code || (string) $slip->unit !== (string) $user->unit)) {
                return response()->json(['status' => false, 'message' => 'Salary slip not found'], 404);
            }
        }

        // The frontend falls back to the employee's own profile for any
        // bank/statutory/contact field missing on the slip itself (older
        // slips predate those columns being backfilled at import time) —
        // same emp_code + company_code lookup salarySlipImport() uses.
        $employee = \App\Models\User::where('emp_code', $slip->emp_code)
            ->where('company_code', $slip->company_code)
            ->where('is_deleted', 0)
            ->first();

        $data = $slip->toArray();
        if ($employee) {
            $data['user'] = [
                'unit' => $employee->unit,
                'department' => $employee->department,
                'designation' => $employee->designation,
                'mobile_number' => $employee->mobile_number,
                'resignation_date' => $employee->resignation_date,
                'bank_account_no' => $employee->bank_account_no,
                'bank_name' => $employee->bank_name,
                'bank_ifsc_code' => $employee->bank_ifsc_code,
                'esi_no' => $employee->esi_no,
                'pf_no' => $employee->pf_no,
            ];
        }

        return response()->json(['status' => true, 'data' => $data]);
    }
}
