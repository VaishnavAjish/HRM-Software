<?php

namespace App\Http\Controllers;

use App\Models\SalarySlip;
use Illuminate\Http\Request;

class SalariesSlipController extends Controller
{
    public function index(Request $request)
    {
        $query = SalarySlip::query();

        $user = auth('api')->user();
        if ($user && (int) $user->role !== 0 && (int) $user->role !== 1 && (int) $user->role !== 2) {
            // Non-admins may only ever see their own salary slips, regardless
            // of what emp_code (or lack of one) the client requests.
            $query->where('emp_code', $user->emp_code);
        } elseif ($user && (int) $user->role === 1) {
            $query->where('company_code', $user->company_code);
            if ($request->emp_code) {
                $query->where('emp_code', $request->emp_code);
            }
        } elseif ($user && (int) $user->role === 2) {
            $query->where('company_code', $user->company_code)->where('unit', $user->unit);
            if ($request->emp_code) {
                $query->where('emp_code', $request->emp_code);
            }
        } elseif ($request->emp_code) {
            $query->where('emp_code', $request->emp_code);
        }

        if ($user && (int) $user->role !== 1 && (int) $user->role !== 2 && $request->company_code) {
            $codes = explode(',', $request->company_code);
            if (!in_array('all', $codes) && !in_array('all-companies', $codes)) {
                $query->whereIn('company_code', $codes);
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

        $slips = $query->orderBy('id', 'desc')->paginate($perPage);

        return response()->json([
            'status' => true,
            'data'   => $slips->items(),
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
            if ((int) $user->role !== 0 && (int) $user->role !== 1 && (int) $user->role !== 2 && (string) $slip->emp_code !== (string) $user->emp_code) {
                return response()->json(['status' => false, 'message' => 'Salary slip not found'], 404);
            }
            if ((int) $user->role === 1) {
                $userCompanyCodes = array_filter(array_map('trim', explode(',', (string)$user->company_code)));
                if (!in_array('all', $userCompanyCodes) && !in_array('all-companies', $userCompanyCodes) && !in_array((string)$slip->company_code, $userCompanyCodes, true)) {
                    return response()->json(['status' => false, 'message' => 'Salary slip not found'], 404);
                }
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
            ->first(['unit', 'department', 'designation', 'mobile_number', 'bank_account_no', 'bank_name', 'bank_ifsc_code', 'esi_no', 'pf_no', 'resignation_date']);

        $data = $slip->toArray();
        $data['user'] = $employee;

        return response()->json(['status' => true, 'data' => $data]);
    }
}
