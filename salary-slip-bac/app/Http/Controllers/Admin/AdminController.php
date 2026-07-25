<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\SalarySlip;
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
            $userQuery->whereIn('company_code', $codes);
            $slipQuery->whereIn('company_code', $codes);
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

        $monthlyStats = (clone $slipQuery)
            ->selectRaw('month, year, COUNT(*) as count, SUM(net_payable) as total_net')
            ->groupBy('year', 'month')
            ->orderBy('year', 'desc')
            ->orderBy('month', 'desc')
            ->take(12)
            ->get();

        $departmentHeadcount = (clone $userQuery)
            ->selectRaw('department, COUNT(*) as total_employees')
            ->whereNotNull('department')
            ->where('department', '!=', '')
            ->groupBy('department')
            ->get();

        $departmentSalary = (clone $slipQuery)
            ->selectRaw('department, SUM(net_payable) as total_net_payable')
            ->whereNotNull('department')
            ->where('department', '!=', '')
            ->groupBy('department')
            ->get()
            ->keyBy('department');

        $departmentDistribution = $departmentHeadcount->map(function ($dept) use ($departmentSalary) {
            $salaryData = $departmentSalary->get($dept->department);
            return [
                'department' => $dept->department,
                'total_employees' => $dept->total_employees,
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
        'con_al' => 'conv_a',
        'conal' => 'conv_a',
        'conveyance' => 'conv_a',
        'conv_a' => 'conv_a',
        'comm' => 'comm',
        'commission' => 'comm',
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
                    $rawByHeader = array_combine($header, $row);
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
                    $skipped[] = "Row {$excelRowNum}: missing or non-numeric employee code";
                    continue;
                }

                [$monthNum, $year] = self::parseSalaryMonthYear(
                    $canonical['month'] ?? null,
                    $canonical['year'] ?? null,
                );
                if (!$monthNum) {
                    $skipped[] = "Row {$excelRowNum}: unrecognized month value";
                    continue;
                }

                $resignationDate = null;
                if (!empty($canonical['resignation_date'])) {
                    try {
                        $resignationDate = \Carbon\Carbon::parse($canonical['resignation_date'])->toDateString();
                    } catch (\Throwable) {
                        $resignationDate = null;
                    }
                }

                $totalDeduction = self::numOrNull($canonical['total_deduction'] ?? null);
                $netSalary = self::numOrNull($canonical['net_salary'] ?? null);

                $insertData = [
                    'company_code' => $company_code,
                    'unit' => $unit ?: null,
                    'month' => (string) $monthNum,
                    'year' => $year,
                    'emp_code' => (int) $empCodeRaw,
                    'emp_name' => $canonical['emp_name'] ?? null,
                    'department' => $canonical['department'] ?? null,
                    'main_department' => $canonical['main_department'] ?? null,
                    'designation' => $canonical['designation'] ?? null,
                    'resignation_date' => $resignationDate,
                    'working_days' => self::numOrNull($canonical['working_days'] ?? null),
                    'present_days' => self::numOrNull($canonical['present_days'] ?? null),
                    'leave' => self::numOrNull($canonical['leave'] ?? null) ?? 0,
                    'salary' => self::numOrNull($canonical['salary'] ?? null),
                    'basic' => self::numOrNull($canonical['basic'] ?? null) ?? 0,
                    'hra' => self::numOrNull($canonical['hra'] ?? null) ?? 0,
                    'da' => self::numOrNull($canonical['da'] ?? null) ?? 0,
                    'conv_a' => self::numOrNull($canonical['conv_a'] ?? null) ?? 0,
                    'comm' => self::numOrNull($canonical['comm'] ?? null),
                    'other' => self::numOrNull($canonical['other'] ?? null),
                    'gross_salary' => self::numOrNull($canonical['gross_salary'] ?? null) ?? 0,
                    'pf' => self::numOrNull($canonical['pf'] ?? null) ?? 0,
                    'pf_uan' => $canonical['pf_uan'] ?? null,
                    'esi' => self::numOrNull($canonical['esi'] ?? null) ?? 0,
                    'esi_no' => $canonical['esi_no'] ?? null,
                    'pt' => self::numOrNull($canonical['pt'] ?? null) ?? 0,
                    'tds' => self::numOrNull($canonical['tds'] ?? null) ?? 0,
                    'lwf' => self::numOrNull($canonical['lwf'] ?? null) ?? 0,
                    'advance' => self::numOrNull($canonical['advance'] ?? null) ?? 0,
                    'total_deduction' => $totalDeduction,
                    'total_deduct' => $totalDeduction ?? 0, // legacy mirror column read by dashboard/reports
                    'net_salary' => $netSalary,
                    'net_payable' => $netSalary ?? 0, // legacy mirror column read by dashboard/reports
                    'account_no' => $canonical['account_no'] ?? null,
                    'account_name' => $canonical['account_name'] ?? null,
                    'bank_ifsc' => $canonical['bank_ifsc'] ?? null,
                    'mobile_no' => $canonical['mobile_no'] ?? null,
                ];

                SalarySlip::create($insertData);
                $imported++;
            }

            \DB::commit();
        } catch (\Throwable $e) {
            \DB::rollBack();
            return response()->json(['status' => false, 'message' => 'Import failed: ' . $e->getMessage()], 500);
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
}
