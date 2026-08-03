<?php

namespace Tests\Feature;

use App\Models\SalarySlip;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

/**
 * Regression test for the salary-slip upload rejecting alphanumeric employee
 * codes (e.g. "S001") with "Missing or non-numeric employee code" — emp_code
 * was validated with is_numeric() and cast to (int), even though both
 * users.emp_code and salary_slips.emp_code are plain strings.
 */
class SalarySlipAlphanumericEmpCodeImportTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create([
            'name' => 'Company Admin', 'email' => 'salary-admin@test.local',
            'password' => 'x', 'role' => 1, 'company_code' => 'nidhi-impex',
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function makeXlsx(array $header, array $row): string
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->fromArray($header, null, 'A1');
        $sheet->fromArray($row, null, 'A2');

        $path = tempnam(sys_get_temp_dir(), 'salary') . '.xlsx';
        (new Xlsx($spreadsheet))->save($path);

        return $path;
    }

    public function test_alphanumeric_employee_code_is_accepted(): void
    {
        $admin = $this->admin();

        User::create([
            'name' => 'Suresh Kumar', 'email' => 'suresh@test.local',
            'password' => 'x', 'role' => 3, 'company_code' => 'nidhi-impex',
            'emp_code' => 'S001', 'department' => 'Production',
            'status' => 0, 'is_deleted' => 0,
        ]);

        $path = $this->makeXlsx(
            ['Emp Code', 'Name', 'Month', 'Year', 'Salary'],
            ['S001', 'Suresh Kumar', 'July', 2026, 20000],
        );
        $file = new UploadedFile(
            $path,
            'salary.xlsx',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            null,
            true
        );

        $response = $this->withToken(auth('api')->login($admin))
            ->post('/api/admin/salary-slip/store', ['salary_slip' => $file]);

        @unlink($path);

        $response->assertOk();
        $response->assertJsonPath('status', true);
        $response->assertJsonPath('imported', 1);
        $this->assertSame([], $response->json('skipped'));

        $slip = SalarySlip::first();
        $this->assertNotNull($slip, 'Expected a salary slip row to be created for emp_code S001');
        $this->assertSame('S001', $slip->emp_code);
        $this->assertSame('Production', $slip->department);
        $this->assertEquals(20000, $slip->net_salary);
    }
}
