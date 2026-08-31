<?php

namespace Tests\Feature;

use App\Models\SalarySlip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

class SalarySlipAllowanceImportTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function admin(string $company = 'nidhi-impex'): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Admin {$n}",
            'email' => "admin-allowance-{$n}@test.local",
            'password' => 'secret',
            'role' => 0,
            'company_code' => $company,
            'emp_code' => "ADM{$n}",
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    private function employee(string $empCode, string $company = 'nidhi-impex'): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Employee {$n}",
            'email' => "emp-allowance-{$n}@test.local",
            'password' => 'secret',
            'role' => 3,
            'company_code' => $company,
            'emp_code' => $empCode,
            'unit' => 'Shreeji',
            'department' => 'Account',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }

    private function createSheet(array $headers, array $rows): UploadedFile
    {
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();

        foreach ($headers as $col => $header) {
            $sheet->setCellValue([$col + 1, 1], $header);
        }

        foreach ($rows as $r => $row) {
            foreach ($row as $col => $value) {
                $sheet->setCellValue([$col + 1, $r + 2], $value);
            }
        }

        $path = tempnam(sys_get_temp_dir(), 'slip_alw_').'.xlsx';
        (new Xlsx($spreadsheet))->save($path);

        return new UploadedFile($path, 'salary.xlsx', null, null, true);
    }

    public function test_nidhi_impex_wa_header_is_imported_and_calculated(): void
    {
        $admin = $this->admin('nidhi-impex');
        $this->employee('NI001', 'nidhi-impex');

        $headers = [
            'Month', 'Year', 'Employee Code', 'Employee Name',
            'BASIC', 'DA', 'HRA', 'W.A', 'Conv. A.',
            'PT', 'PF', 'GROSS_SALARY', 'TOTAL_DEDUCT', 'NetSalary',
        ];
        $rows = [
            ['August', '2026', 'NI001', 'Test Worker', 10000, 5000, 3000, 2000, 1000, 200, 1200, 21000, 1400, 19600],
        ];

        $file = $this->createSheet($headers, $rows);

        $response = $this->withToken(auth('api')->login($admin))
            ->post('/api/admin/salary-slip/store', [
                'salary_slip' => $file,
                'company_code' => 'nidhi-impex',
            ]);

        $response->assertOk();
        $this->assertSame(1, $response->json('imported'));

        $slip = SalarySlip::where('emp_code', 'NI001')->where('company_code', 'nidhi-impex')->first();
        $this->assertNotNull($slip);
        $this->assertEquals(2000, (float) $slip->wa);
        $this->assertEquals(21000, (float) $slip->gross_salary);
        $this->assertEquals(19600, (float) $slip->net_salary);
    }

    public function test_silver_star_perfo_and_other_headers_are_imported(): void
    {
        $admin = $this->admin('silver-star');
        $this->employee('SS001', 'silver-star');

        $headers = [
            'Month', 'Year', 'Employee Code', 'Employee Name',
            'Basic Salary', 'DA', 'HRA', 'Wa.al', 'CON.AL', 'Perfo', 'OTHER',
            'PF', 'PT', 'Gross Salary', 'Total Deduction', 'Net Salary',
        ];
        $rows = [
            ['August', '2026', 'SS001', 'Silver Worker', 15000, 5000, 3000, 1000, 1000, 4500, 2500, 1800, 200, 32000, 2000, 30000],
        ];

        $file = $this->createSheet($headers, $rows);

        $response = $this->withToken(auth('api')->login($admin))
            ->post('/api/admin/salary-slip/store', [
                'salary_slip' => $file,
                'company_code' => 'silver-star',
            ]);

        $response->assertOk();
        $this->assertSame(1, $response->json('imported'));

        $slip = SalarySlip::where('emp_code', 'SS001')->where('company_code', 'silver-star')->first();
        $this->assertNotNull($slip);
        $this->assertEquals(4500, (float) $slip->comm);
        $this->assertEquals(2500, (float) $slip->other);
        $this->assertEquals(32000, (float) $slip->gross_salary);
        $this->assertEquals(30000, (float) $slip->net_salary);
    }
}
