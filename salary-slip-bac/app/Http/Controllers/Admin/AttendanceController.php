<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\UploadBatch;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Daily attendance grid: one status (present/absent/half_day/leave) per
 * employee per day. Backs both single-cell edits from the grid UI and the
 * bulk Excel upload, which reuses the same upload_batches history/rollback
 * infrastructure as the salary and employee bulk-upload flows.
 */
class AttendanceController extends Controller
{
    private const STATUS_CODES = [
        'P' => 'present',
        'A' => 'absent',
        'H' => 'half_day',
        'L' => 'leave',
    ];

    /**
     * Scope company_code/unit to the acting master/manager's own company —
     * mirrors the same restriction UserController::index() applies.
     */
    private function scopedCompany(Request $request): array
    {
        $userAuth = auth('api')->user();
        if ($userAuth && (int) $userAuth->role === 1) {
            return [$userAuth->company_code, $request->unit];
        }
        if ($userAuth && (int) $userAuth->role === 2) {
            return [$userAuth->company_code, $userAuth->unit];
        }
        return [$request->company_code, $request->unit];
    }

    public function grid(Request $request)
    {
        $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer',
        ]);

        [$companyCode, $unit] = $this->scopedCompany($request);
        if (!$companyCode) {
            return response()->json(['status' => false, 'message' => 'Company is required'], 422);
        }

        $employees = User::when($companyCode && !in_array($companyCode, ['all', 'all-companies']), fn($q) => $q->where('company_code', $companyCode))
            ->where('is_deleted', 0)
            ->whereNotIn('role', [0, 1, 2])
            ->where(function ($q) {
                $q->whereNull('type')->orWhereNotIn('type', ['appointment', 'agent']);
            })
            ->when($unit, fn ($q) => $q->where('unit', $unit))
            ->orderBy('name')
            ->get(['id', 'emp_code', 'name', 'department', 'unit'])
            ->values();

        $start = Carbon::create((int) $request->year, (int) $request->month, 1)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $records = Attendance::when($companyCode && !in_array($companyCode, ['all', 'all-companies']), fn($q) => $q->where('company_code', $companyCode))
            ->when($unit, fn ($q) => $q->where('unit', $unit))
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->get(['emp_code', 'date', 'status']);

        $map = [];
        $recordedEmpCodes = [];
        foreach ($records as $r) {
            $map[$r->emp_code][$r->date->format('Y-m-d')] = $r->status;
            $recordedEmpCodes[$r->emp_code] = true;
        }

        if ($request->only_uploaded || $request->only_marked) {
            $employees = $employees->filter(fn ($e) => isset($recordedEmpCodes[$e->emp_code]))->values();
        }

        return response()->json([
            'status' => true,
            'data' => [
                'employees' => $employees,
                'attendance' => $map,
                'days_in_month' => $end->day,
            ],
        ]);
    }

    public function upsertCell(Request $request)
    {
        $data = $request->validate([
            'emp_code' => 'required|string',
            'date' => 'required|date',
            'status' => 'nullable|in:present,absent,half_day,leave',
        ]);

        [$companyCode, ] = $this->scopedCompany($request);
        if (!$companyCode) {
            return response()->json(['status' => false, 'message' => 'Company is required'], 422);
        }

        $employee = User::where('emp_code', $data['emp_code'])->where('company_code', $companyCode)->first();
        if (!$employee) {
            return response()->json(['status' => false, 'message' => 'Employee not found in this company'], 404);
        }

        // A cell cycled all the way back to "unmarked" clears the record
        // rather than storing an empty status — that keeps the grid and the
        // stored data in agreement instead of the cell just looking blank.
        if (empty($data['status'])) {
            Attendance::where('emp_code', $data['emp_code'])
                ->where('company_code', $companyCode)
                ->where('date', $data['date'])
                ->delete();

            return response()->json(['status' => true, 'message' => 'Attendance cleared']);
        }

        // upsert() is a single atomic "INSERT ... ON CONFLICT DO UPDATE"
        // statement. updateOrCreate() instead does a separate SELECT then
        // INSERT/UPDATE, so two clicks on the same cell close enough
        // together both see "no row yet" and both try to INSERT — the
        // second one then fails the (emp_code, company_code, date) unique
        // constraint. upsert() can't be raced that way.
        Attendance::upsert(
            [[
                'emp_code' => $data['emp_code'],
                'company_code' => $companyCode,
                'date' => $data['date'],
                'unit' => $employee->unit,
                'status' => $data['status'],
                'marked_by' => auth('api')->id(),
            ]],
            ['emp_code', 'company_code', 'date'],
            ['unit', 'status', 'marked_by'],
        );

        $attendance = Attendance::where('emp_code', $data['emp_code'])
            ->where('company_code', $companyCode)
            ->where('date', $data['date'])
            ->first();

        return response()->json(['status' => true, 'message' => 'Attendance updated', 'data' => $attendance]);
    }

    public function bulkImport(Request $request)
    {
        $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer',
            'rows' => 'required|array',
        ]);

        [$companyCode, $unit] = $this->scopedCompany($request);
        if (!$companyCode) {
            return response()->json(['status' => false, 'message' => 'Company is required'], 422);
        }

        $month = (int) $request->month;
        $year = (int) $request->year;
        $rowsData = $request->input('rows', []);
        $userId = auth('api')->id();

        $imported = 0;
        $skipped = [];
        $rowReports = [];

        foreach ($rowsData as $rowIndex => $row) {
            $excelRowNum = $rowIndex + 2;
            $empCode = trim((string) ($row['emp_code'] ?? ''));
            if ($empCode === '') {
                $reason = 'Missing employee code';
                $skipped[] = "Row {$excelRowNum}: {$reason}";
                $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $row];
                continue;
            }

            $employee = User::where('emp_code', $empCode)->where('company_code', $companyCode)->first();
            if (!$employee) {
                $reason = "Employee code '{$empCode}' not found in this company";
                $skipped[] = "Row {$excelRowNum}: {$reason}";
                $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $row];
                continue;
            }

            $days = is_array($row['days'] ?? null) ? $row['days'] : [];
            $dayRows = [];
            foreach ($days as $day => $statusCode) {
                $status = self::STATUS_CODES[strtoupper(trim((string) $statusCode))] ?? null;
                if (!$status) {
                    continue;
                }
                $dayRows[] = [
                    'emp_code' => $empCode,
                    'company_code' => $companyCode,
                    'date' => sprintf('%04d-%02d-%02d', $year, $month, (int) $day),
                    'unit' => $employee->unit,
                    'status' => $status,
                    'marked_by' => $userId,
                ];
            }
            if ($dayRows) {
                Attendance::upsert($dayRows, ['emp_code', 'company_code', 'date'], ['unit', 'status', 'marked_by']);
                $imported++;
                $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'passed', 'reason' => null, 'row_data' => $row];
            } else {
                $reason = 'No recognizable attendance values (use P, A, H or L) in this row';
                $skipped[] = "Row {$excelRowNum}: {$reason}";
                $rowReports[] = ['row_number' => $excelRowNum, 'status' => 'failed', 'reason' => $reason, 'row_data' => $row];
            }
        }

        $batchId = null;
        try {
            $batch = UploadBatch::create([
                'type' => 'attendance',
                'company_code' => $companyCode,
                'unit' => $unit,
                'month' => (string) $month,
                'year' => (string) $year,
                'file_name' => "attendance-{$month}-{$year}.xlsx",
                'total_rows' => count($rowReports),
                'success_count' => $imported,
                'failed_count' => count($skipped),
                'uploaded_by' => $userId,
            ]);
            $batch->rows()->createMany($rowReports);
            $batchId = $batch->id;
        } catch (\Throwable $e) {
            \Log::error('Failed to record attendance import batch: ' . $e->getMessage());
        }

        $message = "$imported employee(s) updated";
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
}
