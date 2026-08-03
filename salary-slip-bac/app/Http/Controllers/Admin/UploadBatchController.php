<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\SalarySlip;
use App\Models\UploadBatch;
use App\Models\User;
use Illuminate\Http\Request;

/**
 * Recent-uploads history + per-row pass/fail report for the salary-slip,
 * employee, attendance and account-master bulk uploads — same underlying
 * batch/rows tables, distinguished by $type.
 */
class UploadBatchController extends Controller
{
    private const TYPES = ['salary', 'employee', 'account-master', 'attendance'];

    public function index(Request $request, string $type)
    {
        abort_unless(in_array($type, self::TYPES, true), 404, 'Unknown upload type');

        $userAuth = auth('api')->user();
        $query = UploadBatch::where('type', $type)->withCount('rows');

        if ($userAuth && (int) $userAuth->role === 1) {
            $userCompanyCodes = array_filter(array_map('trim', explode(',', (string)$userAuth->company_code)));
            $hasAllCompanies = in_array('all', $userCompanyCodes) || in_array('all-companies', $userCompanyCodes) || count($userCompanyCodes) >= 2;

            if ($request->company_code && !in_array($request->company_code, ['all', 'all-companies'])) {
                $reqCodes = array_filter(array_map('trim', explode(',', $request->company_code)));
                $allowedCodes = $hasAllCompanies ? $reqCodes : array_intersect($reqCodes, $userCompanyCodes);
                $query->whereIn('company_code', !empty($allowedCodes) ? $allowedCodes : ['__none__']);
            } elseif (!$hasAllCompanies) {
                $query->whereIn('company_code', $userCompanyCodes);
            }
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $query->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            if (!in_array('all', $codes, true)) {
                $query->where(function ($q) use ($codes) {
                    $q->whereIn('company_code', $codes)
                      ->orWhereNull('company_code');
                });
            }
        }

        $perPage = (int) $request->query('limit', 15);
        // created_at alone isn't unique — two batches created in the same
        // second sort in a non-deterministic order across separate paginated
        // queries, so the infinite-scroll history panel can land the page
        // boundary mid-tie and render the same batch on both pages. id is a
        // strictly unique tiebreaker, making page order fully deterministic.
        $batches = $query->orderByDesc('created_at')->orderByDesc('id')->paginate($perPage);

        return response()->json([
            'status' => true,
            'data' => $batches->items(),
            'meta' => [
                'total' => $batches->total(),
                'page' => $batches->currentPage(),
                'limit' => $batches->perPage(),
                'totalPages' => $batches->lastPage(),
            ],
        ]);
    }

    public function show(Request $request, string $type, $id)
    {
        abort_unless(in_array($type, self::TYPES, true), 404, 'Unknown upload type');

        $batch = UploadBatch::where('type', $type)->with('rows')->find($id);
        if (!$batch) {
            return response()->json(['status' => false, 'message' => 'Batch not found'], 404);
        }

        $userAuth = auth('api')->user();
        if ($userAuth && (int) $userAuth->role === 1) {
            $userCompanyCodes = array_filter(array_map('trim', explode(',', (string)$userAuth->company_code)));
            if (!in_array('all', $userCompanyCodes) && !in_array('all-companies', $userCompanyCodes) && !in_array((string)$batch->company_code, $userCompanyCodes, true)) {
                return response()->json(['status' => false, 'message' => 'Batch not found'], 404);
            }
        }
        if ($userAuth && (int) $userAuth->role === 2 && ($batch->company_code !== $userAuth->company_code || $batch->unit !== $userAuth->unit)) {
            return response()->json(['status' => false, 'message' => 'Batch not found'], 404);
        }

        return response()->json(['status' => true, 'data' => $batch]);
    }

    /**
     * Removes an upload's history AND whatever it actually created/updated,
     * so the two stay in sync — deleting a batch means undoing it, not just
     * hiding its log. Employees a batch created are hard-deleted (soft-delete
     * left the row behind forever with a mangled email, invisible in the UI
     * but still occupying the emp_code/email uniqueness index). "account-master"
     * has no safe undo (it only overwrites bank fields on an existing employee
     * with no prior-value snapshot kept), so only its history is removed.
     */
    public function destroy(Request $request, string $type, $id)
    {
        abort_unless(in_array($type, self::TYPES, true), 404, 'Unknown upload type');

        $batch = UploadBatch::where('type', $type)->with('rows')->find($id);
        if (!$batch) {
            return response()->json(['status' => false, 'message' => 'Batch not found'], 404);
        }

        $userAuth = auth('api')->user();
        if ($userAuth && (int) $userAuth->role === 1) {
            $userCompanyCodes = array_filter(array_map('trim', explode(',', (string)$userAuth->company_code)));
            if (!in_array('all', $userCompanyCodes) && !in_array('all-companies', $userCompanyCodes) && !in_array((string)$batch->company_code, $userCompanyCodes, true)) {
                return response()->json(['status' => false, 'message' => 'Batch not found'], 404);
            }
        }
        if ($userAuth && (int) $userAuth->role === 2 && ($batch->company_code !== $userAuth->company_code || $batch->unit !== $userAuth->unit)) {
            return response()->json(['status' => false, 'message' => 'Batch not found'], 404);
        }

        foreach ($batch->rows as $row) {
            if ($row->status !== 'passed') {
                continue;
            }

            $data = $row->row_data ?? [];
            $empCode = $data['emp_code'] ?? null;
            if (!$empCode) {
                continue;
            }

            if ($type === 'salary') {
                $comp = $data['company_code'] ?? $batch->company_code;
                SalarySlip::where('company_code', $comp)
                    ->where('emp_code', $empCode)
                    ->where('month', $data['month'] ?? null)
                    ->where('year', $data['year'] ?? null)
                    ->delete();
            } elseif ($type === 'employee') {
                $comp = $data['company_code'] ?? $batch->company_code;
                User::where('emp_code', $empCode)
                    ->where('company_code', $comp)
                    ->delete();
            } elseif ($type === 'attendance') {
                $comp = $data['company_code'] ?? $batch->company_code;
                $days = is_array($data['days'] ?? null) ? array_keys($data['days']) : [];
                foreach ($days as $day) {
                    $date = sprintf('%04d-%02d-%02d', (int) $batch->year, (int) $batch->month, (int) $day);
                    Attendance::where('emp_code', $empCode)
                        ->where('company_code', $comp)
                        ->where('date', $date)
                        ->delete();
                }
            }
        }

        $batch->delete();

        return response()->json(['status' => true, 'message' => 'Upload and its records removed']);
    }
}
