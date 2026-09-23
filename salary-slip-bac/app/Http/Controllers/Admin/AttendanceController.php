<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\UploadBatch;
use App\Models\User;
use App\Services\Biometric\BiometricUserResolver;
use App\Services\Biometric\EsslBiometricService;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Schema;

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
     * Scope company_code/unit to the acting master/manager's own company.
     * Allows explicit 'all' or 'all-companies' for enterprise-wide viewing.
     */
    private function scopedCompany(Request $request): array
    {
        $requestedCompany = $request->company_code ?: $request->companyId;
        if (!empty($requestedCompany) && in_array($requestedCompany, ['all', 'all-companies'], true)) {
            return ['all', $request->unit];
        }

        $userAuth = auth('api')->user();
        if ($userAuth && (int) $userAuth->role === 1 && empty($requestedCompany)) {
            return [$userAuth->company_code, $request->unit];
        }
        if ($userAuth && (int) $userAuth->role === 2) {
            return [$userAuth->company_code, $userAuth->unit];
        }

        $company = $requestedCompany ?: ($userAuth?->company_code ?: 'all');
        return [$company, $request->unit];
    }

    public function grid(Request $request)
    {
        $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer',
        ]);

        [$companyCode, $unit] = $this->scopedCompany($request);
        if (!$companyCode) {
            $companyCode = 'all';
        }

        $employees = User::when($companyCode && !in_array($companyCode, ['all', 'all-companies']), fn($q) => $q->where('company_code', $companyCode))
            ->where('is_deleted', 0)
            ->whereNotIn('role', [0, 1])
            ->where(function ($q) {
                $q->whereNull('type')->orWhereNotIn('type', ['appointment', 'agent']);
            })
            ->when($unit, fn ($q) => $q->where('unit', $unit))
            ->orderBy('name')
            ->get(['id', 'emp_code', 'punching_no', 'form_no', 'name', 'department', 'unit', 'company_code'])
            ->map(function ($u) {
                // Ensure emp_code is never empty: fall back to punching_no, form_no, or user id
                $effectiveCode = (string) ($u->emp_code ?: $u->punching_no ?: $u->form_no ?: $u->id);
                $u->emp_code = $effectiveCode;
                return $u;
            })
            ->values();

        $start = Carbon::create((int) $request->year, (int) $request->month, 1)->startOfMonth();
        $end = $start->copy()->endOfMonth();

        $selectCols = ['emp_code', 'date', 'status'];
        if (Schema::hasColumn('attendances', 'user_id')) {
            $selectCols[] = 'user_id';
        }
        $hasBiometric = Schema::hasColumn('attendances', 'check_in');
        if ($hasBiometric) {
            $selectCols = array_merge($selectCols, ['check_in', 'check_out', 'work_hours', 'device_serial']);
        }

        $records = Attendance::when($companyCode && !in_array($companyCode, ['all', 'all-companies']), fn($q) => $q->where('company_code', $companyCode))
            ->when($unit, fn ($q) => $q->where('unit', $unit))
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->get($selectCols);

        // Build employee identifier lookup dictionary
        $empIdentifierMap = [];
        foreach ($employees as $e) {
            $eff = (string) $e->emp_code;
            $identifiers = [
                $eff,
                ltrim($eff, '0'),
                (string) ($e->punching_no ?? ''),
                ltrim((string) ($e->punching_no ?? ''), '0'),
                (string) ($e->form_no ?? ''),
                ltrim((string) ($e->form_no ?? ''), '0'),
                (string) ($e->id ?? ''),
            ];
            foreach ($identifiers as $ident) {
                if ($ident !== '') {
                    $empIdentifierMap[$ident] = $eff;
                }
            }
        }

        $map = [];
        $detailsMap = [];
        $recordedEmpCodes = [];
        foreach ($records as $r) {
            $dateKey = $r->date->format('Y-m-d');
            $detail = [
                'status'        => $r->status,
                'check_in'      => $hasBiometric ? $r->check_in : null,
                'check_out'     => $hasBiometric ? $r->check_out : null,
                'work_hours'    => $hasBiometric ? $r->work_hours : null,
                'device_serial' => $hasBiometric ? $r->device_serial : null,
            ];

            $codeStr = (string) $r->emp_code;
            $trimmed = ltrim($codeStr, '0');
            $uIdStr = !empty($r->user_id) ? (string) $r->user_id : null;

            $aliasKeys = array_filter(array_unique([
                $codeStr,
                $trimmed,
                $uIdStr,
                $uIdStr ? 'user_' . $uIdStr : null,
                $empIdentifierMap[$codeStr] ?? null,
                ($trimmed !== '' && isset($empIdentifierMap[$trimmed])) ? $empIdentifierMap[$trimmed] : null,
                ($uIdStr && isset($empIdentifierMap[$uIdStr])) ? $empIdentifierMap[$uIdStr] : null,
            ]));

            foreach ($aliasKeys as $k) {
                $map[$k][$dateKey] = $r->status;
                $detailsMap[$k][$dateKey] = $detail;
                $recordedEmpCodes[$k] = true;
            }
        }

        // Include any biometric punched employees whose ID isn't in users table yet.
        // Use BiometricUserResolver to check the code-map table and resolve
        // "Employee 10044" entries to real user names where a mapping exists.
        $knownCodes = $employees->pluck('emp_code')->filter()->map(fn($c) => (string)$c)->flip();
        $knownIds = $employees->pluck('id')->filter()->map(fn($id) => (int)$id)->flip();

        $unmatchedCodes = [];
        foreach ($records as $r) {
            $c = (string) $r->emp_code;
            $trimmed = ltrim($c, '0');
            $uId = !empty($r->user_id) ? (int) $r->user_id : (is_numeric($c) ? (int)$c : null);

            $matched = isset($knownCodes[$c])
                || ($trimmed !== '' && isset($knownCodes[$trimmed]))
                || ($uId && isset($knownIds[$uId]));

            if (!$matched && !isset($unmatchedCodes[$c])) {
                $unmatchedCodes[$c] = $r;
            }
        }

        $unmatchedPunches = [];
        if (!empty($unmatchedCodes)) {
            // Try resolving unmatched biometric codes via the code-map table
            $resolver = new BiometricUserResolver(array_keys($unmatchedCodes));

            foreach ($unmatchedCodes as $c => $r) {
                $resolvedUser = $resolver->resolve($c);
                $uId = !empty($r->user_id) ? (int) $r->user_id : (is_numeric($c) ? (int)$c : null);

                if ($resolvedUser) {
                    // Code-map matched a real user — use their actual name
                    $effectiveCode = (string) ($resolvedUser->emp_code ?: $resolvedUser->punching_no ?: $resolvedUser->form_no ?: $resolvedUser->id);
                    $unmatchedPunches[$c] = [
                        'id'           => $resolvedUser->id,
                        'emp_code'     => $effectiveCode,
                        'name'         => $resolvedUser->name,
                        'department'   => $resolvedUser->department ?: 'Biometric Enrolled',
                        'unit'         => $resolvedUser->unit ?: ($r->unit ?: 'Headquarters'),
                        'company_code' => $resolvedUser->company_code ?: ($r->company_code ?: 'nidhi-impex'),
                    ];

                    // Also register the resolved user's code in the empIdentifierMap
                    // so their attendance data is linked correctly in the grid
                    $empIdentifierMap[$c] = $effectiveCode;
                    if ($trimmedC = ltrim($c, '0')) {
                        $empIdentifierMap[$trimmedC] = $effectiveCode;
                    }
                } else {
                    // No match anywhere — show as "Employee XXXXX"
                    $unmatchedPunches[$c] = [
                        'id'           => $uId,
                        'emp_code'     => $c,
                        'name'         => "Employee " . $c,
                        'department'   => 'Biometric Enrolled',
                        'unit'         => $r->unit ?: 'Headquarters',
                        'company_code' => $r->company_code ?: 'nidhi-impex',
                    ];
                }
                $recordedEmpCodes[$c] = true;
            }
        }

        if (!empty($unmatchedPunches)) {
            $employees = $employees->concat(array_values($unmatchedPunches))->values();
        }

        if ($request->only_uploaded || $request->only_marked) {
            $employees = $employees->filter(function ($e) use ($recordedEmpCodes) {
                $c = (string) $e->emp_code;
                $trimmed = ltrim($c, '0');
                $idStr = (string) $e->id;
                return isset($recordedEmpCodes[$c])
                    || ($trimmed !== '' && isset($recordedEmpCodes[$trimmed]))
                    || ($idStr && isset($recordedEmpCodes[$idStr]));
            })->values();
        }

        return response()->json([
            'status' => true,
            'data' => [
                'employees'          => $employees,
                'attendance'         => $map,
                'attendance_details' => $detailsMap,
                'days_in_month'      => $end->day,
            ],
        ]);
    }

    /**
     * Trigger live biometric synchronization from connected eSSL machines.
     */
    public function syncEssl(Request $request, EsslBiometricService $service)
    {
        $request->validate([
            'month'          => 'nullable|integer|min:1|max:12',
            'year'           => 'nullable|integer|min:2020|max:2035',
            'company_code'   => 'nullable|string',
            'device_serials' => 'nullable|array',
            'start_date'     => 'nullable|date',
            'end_date'       => 'nullable|date',
        ]);

        [$companyCode, ] = $this->scopedCompany($request);

        $month = (int) ($request->month ?: Carbon::now()->month);
        $year = (int) ($request->year ?: Carbon::now()->year);
        $devices = $request->device_serials ?: null;
        $userId = auth('api')->id();

        try {
            $result = $service->syncAttendance(
                $month,
                $year,
                $devices,
                $companyCode,
                $userId,
                $request->start_date,
                $request->end_date
            );

            return response()->json($result);
        } catch (\Throwable $e) {
            \Log::error("eSSL sync failed: " . $e->getMessage());
            return response()->json([
                'status'  => false,
                'message' => 'eSSL Biometric sync failed: ' . $e->getMessage(),
            ], 500);
        }
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
                'user_id' => $employee->id,
            ]],
            ['emp_code', 'company_code', 'date'],
            ['unit', 'status', 'marked_by', 'user_id'],
        );

        $attendance = Attendance::where('emp_code', $data['emp_code'])
            ->where('company_code', $companyCode)
            ->where('date', $data['date'])
            ->first();

        return response()->json(['status' => true, 'message' => 'Attendance updated', 'data' => $attendance]);
    }

    /** Maximum attendance rows accepted in a single bulk import request. */
    private const MAX_BULK_ROWS = 500;

    public function bulkImport(Request $request)
    {
        // Bound the request and validate each row's shape BEFORE any write, so an
        // oversized or malformed payload is rejected with 422 and never produces
        // a partial import. The array is not backed by a file, so post_max_size
        // is the only other ceiling; this makes the limit explicit.
        $request->validate([
            'month' => 'required|integer|min:1|max:12',
            'year' => 'required|integer|min:2000|max:2100',
            'rows' => 'required|array|max:' . self::MAX_BULK_ROWS,
            'rows.*' => 'array',
            'rows.*.days' => 'nullable|array',
        ], [
            'rows.max' => 'A bulk attendance import is limited to ' . self::MAX_BULK_ROWS . ' rows per request.',
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
                    'user_id' => $employee->id,
                ];
            }
            if ($dayRows) {
                Attendance::upsert($dayRows, ['emp_code', 'company_code', 'date'], ['unit', 'status', 'marked_by', 'user_id']);
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
