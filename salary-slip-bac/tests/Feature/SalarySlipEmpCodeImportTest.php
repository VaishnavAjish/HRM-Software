<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

/**
 * Employee codes in a salary-slip upload are strings, not numbers.
 *
 * Codes such as "S001" are normal here — several units prefix them with a
 * letter — and users.emp_code is a plain string column. The importer used to
 * refuse anything non-numeric ("Missing or non-numeric employee code"), which
 * silently skipped every row for those employees while reporting the upload as
 * successful with zero records written.
 */
class SalarySlipEmpCodeImportTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    private function admin(): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Admin {$n}", 'email' => "slip-admin-{$n}@test.local",
            'password' => 'x', 'role' => 0, 'company_code' => 'silver-star',
            'emp_code' => "ADM{$n}", 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function employee(string $empCode, string $company = 'silver-star'): User
    {
        $n = ++$this->seq;

        return User::create([
            'name' => "Worker {$n}", 'email' => "slip-emp-{$n}@test.local",
            'password' => 'x', 'role' => 3, 'company_code' => $company,
            'emp_code' => $empCode, 'unit' => 'Daduk', 'department' => 'Production',
            'status' => 0, 'is_deleted' => 0,
        ]);
    }

    /** Build a real .xlsx the importer can read, as the UI would submit it. */
    private function sheet(array $rows): UploadedFile
    {
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();

        $headers = ['Emp Code', 'Name', 'Month', 'Year', 'Net Salary'];
        foreach ($headers as $col => $header) {
            $sheet->setCellValue([$col + 1, 1], $header);
        }

        foreach ($rows as $r => $row) {
            foreach ($row as $col => $value) {
                // setCellValueExplicit keeps "S001" a string; the default would
                // let PhpSpreadsheet infer a type and is what a real upload does.
                $sheet->setCellValue([$col + 1, $r + 2], $value);
            }
        }

        $path = tempnam(sys_get_temp_dir(), 'slip').'.xlsx';
        (new Xlsx($spreadsheet))->save($path);

        return new UploadedFile($path, 'salary.xlsx', null, null, true);
    }

    private function upload(User $actor, UploadedFile $file, string $company = 'silver-star')
    {
        return $this->withToken(auth('api')->login($actor))
            ->post('/api/admin/salary-slip/store', [
                'salary_slip' => $file,
                'company_code' => $company,
            ]);
    }

    public function test_a_letter_prefixed_employee_code_is_imported(): void
    {
        $admin = $this->admin();
        $this->employee('S001');

        $response = $this->upload($admin, $this->sheet([
            ['S001', 'ghn hdg', 'August', '2026', '50000'],
        ]));

        $response->assertOk();

        // The exact row from the screenshot: it used to be skipped as
        // "non-numeric" and nothing was written.
        $this->assertSame(1, $response->json('imported'), 'S001 was not imported');
        $this->assertSame([], $response->json('skipped'));
        $this->assertDatabaseHas('salary_slips', ['emp_code' => 'S001']);
    }

    public function test_the_stored_code_keeps_its_letters(): void
    {
        $admin = $this->admin();
        $this->employee('S001');

        $this->upload($admin, $this->sheet([['S001', 'ghn hdg', 'August', '2026', '50000']]))
            ->assertOk();

        // A numeric column would have stored 1, or 0, silently detaching the
        // slip from its employee.
        $this->assertSame('S001', \DB::table('salary_slips')->value('emp_code'));
    }

    public function test_a_purely_numeric_code_still_works(): void
    {
        $admin = $this->admin();
        $this->employee('1145');

        $response = $this->upload($admin, $this->sheet([
            ['1145', 'Numeric Person', 'August', '2026', '42000'],
        ]));

        $response->assertOk();
        $this->assertSame(1, $response->json('imported'));
        $this->assertDatabaseHas('salary_slips', ['emp_code' => '1145']);
    }

    public function test_a_row_with_no_employee_code_is_still_refused(): void
    {
        $admin = $this->admin();

        $response = $this->upload($admin, $this->sheet([
            ['', 'No Code', 'August', '2026', '50000'],
        ]));

        $response->assertOk();
        $this->assertSame(0, $response->json('imported'));

        // Blank is genuinely unusable — the slip could not be attached to
        // anybody — so it is reported rather than guessed at.
        $skipped = $response->json('skipped');
        $this->assertCount(1, $skipped);
        $this->assertStringContainsString('Missing employee code', $skipped[0]);
        $this->assertStringNotContainsString('non-numeric', $skipped[0]);
    }

    public function test_mixed_codes_import_together(): void
    {
        $admin = $this->admin();
        $this->employee('S001');
        $this->employee('1145');
        $this->employee('EMP-77');

        $response = $this->upload($admin, $this->sheet([
            ['S001', 'A', 'August', '2026', '50000'],
            ['1145', 'B', 'August', '2026', '41000'],
            ['EMP-77', 'C', 'August', '2026', '39000'],
        ]));

        $response->assertOk();
        $this->assertSame(3, $response->json('imported'));
    }
}
