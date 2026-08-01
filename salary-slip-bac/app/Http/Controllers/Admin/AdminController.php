<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\SalarySlip;
use App\Models\UploadBatch;
use App\Models\User;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;

class AdminController extends Controller
{
    public function dashboard(Request $request)
    {
        $userQuery = User::where('is_deleted', 0)
            ->where('role', '!=', 0)
            ->where(function ($q) {
                $q->whereNull('type')
                  ->orWhereNotIn('type', ['appointment', 'agent']);
            });
        $slipQuery = SalarySlip::query();

        $userAuth = auth('api')->user();
        if ($userAuth && (int) $userAuth->role === 1) {
            $userQuery->where('company_code', $userAuth->company_code);
            $slipQuery->where('company_code', $userAuth->company_code);
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $userQuery->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
            $slipQuery->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            if (!in_array('all', $codes) && !in_array('all-companies', $codes)) {
                $userQuery->whereIn('company_code', $codes);
                $slipQuery->whereIn('company_code', $codes);
            }
        }
        if ($request->unit) {
            $userQuery->where('unit', $request->unit);
            $slipQuery->where('unit', $request->unit);
        }
        if ($request->month) {
            if (strpos($request->month, 'to') !== false) {
                $dates = explode('to', $request->month);
                if (count($dates) == 2) {
                    $from = explode('/', $dates[0]);
                    $to = explode('/', $dates[1]);
                    if (count($from) == 2 && count($to) == 2) {
                        $fromMonth = (int)$from[0];
                        $fromYear = (int)$from[1];
                        $toMonth = (int)$to[0];
                        $toYear = (int)$to[1];

                        $slipQuery->where(function($q) use ($fromMonth, $fromYear, $toMonth, $toYear) {
                            $q->where(function($q1) use ($fromMonth, $fromYear) {
                                $q1->where('year', '>', $fromYear)
                                   ->orWhere(function($q2) use ($fromMonth, $fromYear) {
                                       $q2->where('year', $fromYear)->whereRaw('CAST(month AS UNSIGNED) >= ?', [$fromMonth]);
                                   });
                            })->where(function($q1) use ($toMonth, $toYear) {
                                $q1->where('year', '<', $toYear)
                                   ->orWhere(function($q2) use ($toMonth, $toYear) {
                                       $q2->where('year', $toYear)->whereRaw('CAST(month AS UNSIGNED) <= ?', [$toMonth]);
                                   });
                            });
                        });
                    }
                }
            } else {
                $slipQuery->where('month', $request->month);
            }
        }
        if ($request->year) {
            $slipQuery->where('year', $request->year);
        }

        $totalEmployees = $userQuery->count();
        $activeEmployees = (clone $userQuery)->where('status', 0)->count();
        $totalSlips = $slipQuery->count();
        $totalSalaryPaid = (clone $slipQuery)->sum('net_payable');

        $recentSlips = (clone $slipQuery)->orderBy('id', 'desc')->take(10)->get();

        $batchQuery = \App\Models\UploadBatch::query();
        if ($userAuth && (int) $userAuth->role === 1) {
            $batchQuery->where('company_code', $userAuth->company_code);
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $batchQuery->where('company_code', $userAuth->company_code)->where('unit', $userAuth->unit);
        } elseif ($request->company_code) {
            $codes = explode(',', $request->company_code);
            if (!in_array('all', $codes) && !in_array('all-companies', $codes)) {
                $batchQuery->whereIn('company_code', $codes);
            }
        }
        if ($request->unit) {
            $batchQuery->where('unit', $request->unit);
        }
        $recentBatches = $batchQuery->orderBy('id', 'desc')->take(5)->get();

        $monthlyStats = (clone $slipQuery)
            ->selectRaw('month, year, COUNT(*) as count, SUM(net_payable) as total_net')
            ->groupBy('year', 'month')
            ->orderBy('year', 'desc')
            ->orderBy('month', 'desc')
            ->take(12)
            ->get();

        $allDepartments = \App\Models\Department::pluck('name')->toArray();

        $departmentHeadcount = (clone $userQuery)
            ->selectRaw('department, COUNT(*) as total_employees')
            ->whereNotNull('department')
            ->where('department', '!=', '')
            ->groupBy('department')
            ->get()
            ->keyBy('department');

        $departmentSalary = (clone $slipQuery)
            ->selectRaw('department, SUM(net_payable) as total_net_payable')
            ->whereNotNull('department')
            ->where('department', '!=', '')
            ->groupBy('department')
            ->get()
            ->keyBy('department');

        $usedDepartments = $departmentHeadcount->keys()->merge($departmentSalary->keys())->toArray();
        $allDeptsMerged = array_unique(array_merge($allDepartments, $usedDepartments));

        $departmentDistribution = collect($allDeptsMerged)->map(function ($deptName) use ($departmentHeadcount, $departmentSalary) {
            $headcount = $departmentHeadcount->get($deptName);
            $salaryData = $departmentSalary->get($deptName);
            return [
                'department' => $deptName,
                'total_employees' => $headcount ? $headcount->total_employees : 0,
                'total_net_payable' => $salaryData ? $salaryData->total_net_payable : 0,
            ];
        })->values();

        return response()->json([
            'status' => true,
            'data'   => [
                'total_employee' => $totalEmployees,
                'active_employee'=> $activeEmployees,
                'total_slips'     => $totalSlips,
                'total_salary_paid' => $totalSalaryPaid,
                'salary_slip'    => $recentSlips,
                'recent_batches' => $recentBatches,
                'monthly_stats'   => $monthlyStats,
                'department_distribution' => $departmentDistribution,
            ],
        ]);
    }

    /**
     * Maps normalized spreadsheet header text to salary_slips DB columns.
     * Lets the import auto-detect columns without requiring an explicit
     * frontend-supplied mapping for common header spellings.
     */
    private static array $salaryColumnAliases = [
        'month' => 'month',
        'year' => 'year',
        'employee_code' => 'emp_code',
        'emp_code' => 'emp_code',
        'empcode' => 'emp_code',
        'code' => 'emp_code',
        'employee_name' => 'emp_name',
        'emp_name' => 'emp_name',
        'empname' => 'emp_name',
        'employee' => 'emp_name',
        'name' => 'emp_name',
        'main_department' => 'main_department',
        'department' => 'department',
        'designation' => 'designation',
        'resignation_date' => 'resignation_date',
        'working_days' => 'working_days',
        'workingdays' => 'working_days',
        'present_days' => 'present_days',
        'presentdays' => 'present_days',
        'leave' => 'leave',
        'salary' => 'salary',
        'basic_salary' => 'basic',
        'basic' => 'basic',
        'hra' => 'hra',
        'da' => 'da',
        'wa_al' => 'wa',
        'wa' => 'wa',
        'washing_allowance' => 'wa',
        'washing' => 'wa',
        'con_al' => 'conv_a',
        'conal' => 'conv_a',
        'conveyance' => 'conv_a',
        'conv_a' => 'conv_a',
        'comm' => 'comm',
        'commission' => 'comm',
        // "Perfo" (Performance) is the current business label for this same
        // column — a rename, not a new field. See 'comm' above.
        'perfo' => 'comm',
        'performance' => 'comm',
        'other' => 'other',
        'others' => 'other',
        'gross_salary' => 'gross_salary',
        'pf' => 'pf',
        'pf_uan' => 'pf_uan',
        'uan' => 'pf_uan',
        'esi' => 'esi',
        'esi_no' => 'esi_no',
        'pt' => 'pt',
        'tds' => 'tds',
        'lwf' => 'lwf',
        'advance' => 'advance',
        'total_deduction' => 'total_deduction',
        'total_dedu' => 'total_deduction',
        'total_deduct' => 'total_deduction',
        'totaldeduction' => 'total_deduction',
        'net_salary' => 'net_salary',
        'net_payable' => 'net_salary',
        'netsalary' => 'net_salary',
        'account_no' => 'account_no',
        'accountno' => 'account_no',
        'account_name' => 'account_name',
        'bank_ifsc' => 'bank_ifsc',
        'bankifsc' => 'bank_ifsc',
        'mobile_no' => 'mobile_no',
        'mobile' => 'mobile_no',
        'phone' => 'mobile_no',
    ];

    private static array $salaryMonthNames = [
        'jan' => 1, 'january' => 1,
        'feb' => 2, 'february' => 2,
        'mar' => 3, 'march' => 3,
        'apr' => 4, 'april' => 4,
        'may' => 5,
        'jun' => 6, 'june' => 6,
        'jul' => 7, 'july' => 7,
        'aug' => 8, 'august' => 8,
        'sep' => 9, 'sept' => 9, 'september' => 9,
        'oct' => 10, 'october' => 10,
        'nov' => 11, 'november' => 11,
        'dec' => 12, 'december' => 12,
    ];

    private static function normalizeHeader(?string $header): string
    {
        $h = strtolower(trim((string) $header));
        $h = preg_replace('/[^a-z0-9]+/', '_', $h);
        return trim($h, '_');
    }

    private static function numOrNull($value): ?float
    {
        if ($value === null || $value === '') {
            return null;
        }
        $clean = preg_replace('/[^0-9.\-]/', '', (string) $value);
        return $clean === '' || $clean === '-' ? null : (float) $clean;
    }

    /**
     * Parses free-form month/year values ("June", "jun", "6", "06/2026", "2026-06")
     * into a numeric month + year, defaulting the year to the current year when
     * it can't be determined (the upload template has no dedicated Year column).
     */
    private static function parseSalaryMonthYear($rawMonth, $rawYear): array
    {
        $year = null;
        if ($rawYear !== null && trim((string) $rawYear) !== '') {
            $y = (int) preg_replace('/[^0-9]/', '', (string) $rawYear);
            if ($y >= 1900) {
                $year = $y;
            }
        }

        $monthNum = null;
        $monthStr = trim((string) $rawMonth);

        if ($monthStr !== '') {
            if (is_numeric($monthStr) && (int) $monthStr >= 1 && (int) $monthStr <= 12) {
                $monthNum = (int) $monthStr;
            } elseif (preg_match('/^(\d{1,2})[\/\-](\d{4})$/', $monthStr, $m)) {
                $monthNum = (int) $m[1];
                $year = $year ?? (int) $m[2];
            } elseif (preg_match('/^(\d{4})[\/\-](\d{1,2})$/', $monthStr, $m)) {
                $monthNum = (int) $m[2];
                $year = $year ?? (int) $m[1];
            } elseif (preg_match('/([A-Za-z]+)\D*(\d{4})?/', $monthStr, $m)) {
                $name = strtolower($m[1]);
                if (isset(self::$salaryMonthNames[$name])) {
                    $monthNum = self::$salaryMonthNames[$name];
                    if (!empty($m[2])) {
                        $year = $year ?? (int) $m[2];
                    }
                }
            }
        }

        if ($monthNum !== null && !$year) {
            $year = (int) date('Y');
        }

        return [$monthNum, $year];
    }

    public function salarySlipImport(Request $request)
    {
        $request->validate(['salary_slip' => 'required|file']);

        $userAuth = auth('api')->user();
        if ($userAuth && (int) $userAuth->role === 1) {
            $company_code = $userAuth->company_code;
            $unit = $request->unit;
        } elseif ($userAuth && (int) $userAuth->role === 2) {
            $company_code = $userAuth->company_code;
            $unit = $userAuth->unit;
        } else {
            $company_code = $request->company_code ?? 'nidhi-impex';
            $unit = $request->unit;
        }
        $mapping = $request->mapping ? json_decode($request->mapping, true) : [];
        $imported = 0;
        $skipped = [];
        $rowReports = [];
        $batchMonth = null;
        $batchYear = null;

        try {
            $spreadsheet = \PhpOffice\PhpSpreadsheet\IOFactory::load($request->file('salary_slip')->getPathname());
            $rows = $spreadsheet->getActiveSheet()->toArray();
            $header = array_shift($rows);

            $columnForIndex = [];
            if (!$mapping) {
                foreach ($header as $i => $h) {
                    $norm = self::normalizeHeader($h);
                    if (isset(self::$salaryColumnAliases[$norm])) {
                        $columnForIndex[$i] = self::$salaryColumnAliases[$norm];
                    }
                }
            }

            \DB::beginTransaction();

            foreach ($rows as $rowIndex => $row) {
                if (!array_filter($row, fn ($v) => $v !== null && $v !== '')) {
                    continue; // blank row
                }

                $canonical = [];
                if ($mapping) {
                    // Guard against ragged rows (fewer/more cells than the
                    // header) — array_combine() throws on a length mismatch.
                    $paddedRow = array_slice(array_pad($row, count($header), null), 0, count($header));
                    $rawByHeader = array_combine($header, $paddedRow);
                    foreach ($mapping as $dbField => $excelCol) {
                        $canonical[$dbField] = $rawByHeader[$excelCol] ?? null;
                    }
                } else {
                    foreach ($columnForIndex as $i => $dbField) {
                        $canonical[$dbField] = $row[$i] ?? null;
                    }
                }

                $excelRowNum = $rowIndex + 2; // +1 for header, +1 for 1-index

                $empCodeRaw = trim((string) ($canonical['emp_code'] ?? ''));
                if ($empCodeRaw === '' || !is_numeric($empCodeRaw)) {
                    $reason = 'Missing or non-numeric employee code';
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = [
                        'row_number' => $excelRowNum,
                        'status' => 'failed',
                        'reason' => $reason,
                        'row_data' => $canonical,
                    ];
                    continue;
                }

                [$monthNum, $year] = self::parseSalaryMonthYear(
                    $canonical['month'] ?? null,
                    $canonical['year'] ?? null,
                );
                if (!$monthNum) {
                    $reason = 'Unrecognized month value';
                    $skipped[] = "Row {$excelRowNum}: {$reason}";
                    $rowReports[] = [
                        'row_number' => $excelRowNum,
                        'status' => 'failed',
                        'reason' => $reason,
                        'row_data' => $canonical,
                    ];
                    continue;
                }
                $batchMonth ??= (string) $monthNum;
                $batchYear ??= $year;

                $resignationDate = null;
                if (!empty($canonical['resignation_date'])) {
                    try {
                        $resignationDate = \Carbon\Carbon::parse($canonical['resignation_date'])->toDateString();
                    } catch (\Throwable) {
                        $resignationDate = null;
                    }
                }

                // Fill in name/department/designation from the employee's own
                // record when the sheet doesn't carry them — otherwise a
                // minimal upload (just code + salary) leaves slips with a
                // blank department, which breaks anything that groups by it.
                $employee = User::where('emp_code', (int) $empCodeRaw)
                    ->where('company_code', $company_code)
                    ->first();

                $basic = self::numOrNull($canonical['basic'] ?? null) ?? 0;
                $hra = self::numOrNull($canonical['hra'] ?? null) ?? 0;
                $da = self::numOrNull($canonical['da'] ?? null) ?? 0;
                $wa = self::numOrNull($canonical['wa'] ?? null) ?? 0;
                $convA = self::numOrNull($canonical['conv_a'] ?? null) ?? 0;
                $comm = self::numOrNull($canonical['comm'] ?? null) ?? 0;
                $other = self::numOrNull($canonical['other'] ?? null) ?? 0;
                $salary = self::numOrNull($canonical['salary'] ?? null) ?? 0;
                $componentGross = $basic + $hra + $da + $wa + $convA + $comm + $other;
                // Prefer the sum of earning components; fall back to a flat
                // "Salary" figure for sheets that only give one number.
                $grossSalary = $componentGross > 0
                    ? $componentGross
                    : (self::numOrNull($canonical['gross_salary'] ?? null) ?? $salary);

                $pf = self::numOrNull($canonical['pf'] ?? null) ?? 0;
                $esi = self::numOrNull($canonical['esi'] ?? null) ?? 0;
                $pt = self::numOrNull($canonical['pt'] ?? null) ?? 0;
                $tds = self::numOrNull($canonical['tds'] ?? null) ?? 0;
                $lwf = self::numOrNull($canonical['lwf'] ?? null) ?? 0;
                $advance = self::numOrNull($canonical['advance'] ?? null) ?? 0;
                $componentDeduction = $pf + $esi + $pt + $tds + $lwf + $advance;
                // Same idea: sum the deduction components; only trust a
                // sheet-supplied total when no components were given at all.
                $totalDeduction = $componentDeduction > 0
                    ? $componentDeduction
                    : (self::numOrNull($canonical['total_deduction'] ?? null) ?? 0);

                // Net salary is always gross minus deductions — never taken
                // as a raw column — so it can't drift out of sync with them.
                $netSalary = $grossSalary - $totalDeduction;

                $insertData = [
                    'company_code' => $company_code,
                    'unit' => $unit ?: ($employee->unit ?? null),
                    'month' => (string) $monthNum,
                    'year' => $year,
                    'emp_code' => (int) $empCodeRaw,
                    'emp_name' => $canonical['emp_name'] ?? $employee->name ?? null,
                    'department' => $canonical['department'] ?? $employee->department ?? null,
                    'main_department' => $canonical['main_department'] ?? null,
                    'designation' => $canonical['designation'] ?? $employee->designation ?? null,
                    'resignation_date' => $resignationDate,
                    'working_days' => self::numOrNull($canonical['working_days'] ?? null),
                    'present_days' => self::numOrNull($canonical['present_days'] ?? null),
                    'leave' => self::numOrNull($canonical['leave'] ?? null) ?? 0,
                    'salary' => $salary,
                    'basic' => $basic,
                    'hra' => $hra,
                    'da' => $da,
                    'wa' => $wa,
                    'conv_a' => $convA,
                    'comm' => $comm,
                    'other' => $other,
                    'gross_salary' => $grossSalary,
                    'pf' => $pf,
                    'pf_uan' => $canonical['pf_uan'] ?? $employee->pf_no ?? null,
                    'esi' => $esi,
                    'esi_no' => $canonical['esi_no'] ?? $employee->esi_no ?? null,
                    'pt' => $pt,
                    'tds' => $tds,
                    'lwf' => $lwf,
                    'advance' => $advance,
                    'total_deduction' => $totalDeduction,
                    'total_deduct' => $totalDeduction, // legacy mirror column read by dashboard/reports
                    'net_salary' => $netSalary,
                    'net_payable' => $netSalary, // legacy mirror column read by dashboard/reports
                    // The upload template has no columns for these — they were
                    // only ever filled when a sheet happened to carry them
                    // (never), leaving every payslip's bank/contact/statutory
                    // details blank. Fall back to the employee's own stored
                    // profile, same as emp_name/department/designation above.
                    'account_no' => $canonical['account_no'] ?? $employee->bank_account_no ?? null,
                    'account_name' => $canonical['account_name'] ?? null,
                    'bank_ifsc' => $canonical['bank_ifsc'] ?? $employee->bank_ifsc_code ?? null,
                    'mobile_no' => $canonical['mobile_no'] ?? $employee->mobile_number ?? null,
                ];

                // Keyed on employee + month + year (not unit — an employee
                // can only have one slip per month) so re-uploading the same
                // month updates that slip instead of creating a duplicate.
                $slip = SalarySlip::updateOrCreate(
                    [
                        'company_code' => $company_code,
                        'emp_code' => (int) $empCodeRaw,
                        'month' => (string) $monthNum,
                        'year' => $year,
                    ],
                    $insertData
                );
                $imported++;
                $rowReports[] = [
                    'row_number' => $excelRowNum,
                    'status' => 'passed',
                    'reason' => $slip->wasRecentlyCreated ? null : 'Updated existing slip for this month',
                    'row_data' => $insertData,
                ];
            }

            \DB::commit();
        } catch (\Throwable $e) {
            \DB::rollBack();
            return response()->json(['status' => false, 'message' => 'Import failed: ' . $e->getMessage()], 500);
        }

        $batchId = null;
        try {
            $batch = UploadBatch::create([
                'type' => 'salary',
                'company_code' => $company_code,
                'unit' => $unit ?: null,
                'month' => $batchMonth,
                'year' => $batchYear,
                'file_name' => $request->file('salary_slip')->getClientOriginalName(),
                'total_rows' => count($rowReports),
                'success_count' => $imported,
                'failed_count' => count($skipped),
                'uploaded_by' => $userAuth?->id,
            ]);
            $batch->rows()->createMany($rowReports);
            $batchId = $batch->id;
        } catch (\Throwable $e) {
            \Log::error('Failed to record salary import batch: ' . $e->getMessage());
        }

        $message = "$imported salary slips imported";
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

    public function importColumns()
    {
        $columns = \Schema::getColumnListing('salary_slips');
        return response()->json(['status' => true, 'data' => $columns]);
    }

    public function salaryDelete(Request $request)
    {
        $id = $request->id;
        if (!$id) {
            return response()->json(['status' => false, 'message' => 'ID required'], 422);
        }

        $slip = SalarySlip::find($id);
        if (!$slip) {
            return response()->json(['status' => false, 'message' => 'Salary slip not found'], 404);
        }

        // Mirror the same company/unit scoping salarySlipImport() applies on
        // create, so a unit-scoped manager can't delete another company's or
        // another unit's payslip just by knowing its id.
        $userAuth = auth('api')->user();
        if ($userAuth && (int) $userAuth->role === 1 && $slip->company_code !== $userAuth->company_code) {
            return response()->json(['status' => false, 'message' => 'Salary slip not found'], 404);
        }
        if ($userAuth && (int) $userAuth->role === 2
            && ($slip->company_code !== $userAuth->company_code || $slip->unit !== $userAuth->unit)) {
            return response()->json(['status' => false, 'message' => 'Salary slip not found'], 404);
        }

        $slip->delete();

        return response()->json(['status' => true, 'message' => 'Salary slip deleted']);
    }

    public function getDepartment(Request $request)
    {
        $departments = Department::orderBy('name')->get();
        return response()->json(['status' => true, 'data' => $departments]);
    }

    public function storeDepartment(Request $request)
    {
        $request->validate(['name' => 'required']);

        $department = Department::create(['name' => $request->name]);

        return response()->json(['status' => true, 'message' => 'Department created', 'data' => $department]);
    }

    public function updateDepartment(Request $request, $id)
    {
        $request->validate(['name' => 'required']);

        $department = Department::find($id);
        if (!$department) {
            return response()->json(['status' => false, 'message' => 'Department not found'], 404);
        }

        $department->name = $request->name;
        $department->save();

        return response()->json(['status' => true, 'message' => 'Department updated', 'data' => $department]);
    }

    public function deleteDepartment($id)
    {
        $department = Department::find($id);
        if (!$department) {
            return response()->json(['status' => false, 'message' => 'Department not found'], 404);
        }

        $department->delete();

        return response()->json(['status' => true, 'message' => 'Department deleted']);
    }
}
