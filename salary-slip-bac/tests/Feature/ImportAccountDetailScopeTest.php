<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

/**
 * Company scoping of the bank-details import.
 *
 * UserController::importAccountDetail matches on the employee code alone:
 *
 *     User::where('emp_code', $rowData['emp_code'])->update([...])
 *
 * There is no company filter and no ->first(), so every row sharing that code
 * is rewritten — across companies. emp_code carries no unique constraint, and
 * the same code legitimately exists in more than one company.
 *
 * Recorded here before porting; the Node implementation scopes the update to
 * the caller's companies.
 */
class ImportAccountDetailScopeTest extends TestCase
{
    use RefreshDatabase;

    private function admin(string $company, int $role = 1): User
    {
        return User::create([
            'name' => 'Admin', 'email' => "acct-admin-{$company}@test.local",
            'password' => 'x', 'role' => $role, 'company_code' => $company,
            'unit' => 'Ichapur', 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function employee(string $company, string $empCode): User
    {
        return User::create([
            'name' => "Worker {$company}", 'email' => "acct-{$company}@test.local",
            'password' => 'x', 'role' => 3, 'company_code' => $company, 'unit' => 'Ichapur',
            'emp_code' => $empCode, 'bank_name' => 'Original Bank',
            'bank_account_no' => '111111', 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    private function sheet(array $rows): UploadedFile
    {
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();

        $headers = ['emp_code', 'bank_name', 'bank_account_no', 'bank_ifsc_code'];
        foreach ($headers as $col => $header) {
            $sheet->setCellValue([$col + 1, 1], $header);
        }
        foreach ($rows as $r => $row) {
            foreach ($row as $col => $value) {
                $sheet->setCellValue([$col + 1, $r + 2], $value);
            }
        }

        $path = tempnam(sys_get_temp_dir(), 'acct') . '.xlsx';
        (new Xlsx($spreadsheet))->save($path);

        return new UploadedFile($path, 'accounts.xlsx', null, null, true);
    }

    public function test_it_updates_the_matching_employee(): void
    {
        $admin = $this->admin('nidhi-impex');
        $employee = $this->employee('nidhi-impex', '1138');

        $this->withToken(auth('api')->login($admin))
            ->post('/api/employee/import-account-detail', [
                'file' => $this->sheet([['1138', 'New Bank', '999999', 'SBIN0001234']]),
            ])->assertOk();

        $this->assertSame('New Bank', $employee->fresh()->bank_name);
        $this->assertSame('999999', $employee->fresh()->bank_account_no);
    }

    /**
     * The behaviour in question: an admin of one company rewrites the bank
     * details of another company's employee who happens to share a code.
     */
    public function test_it_also_rewrites_another_companys_employee(): void
    {
        $admin = $this->admin('nidhi-impex');
        $ours = $this->employee('nidhi-impex', '1138');
        $theirs = $this->employee('silver-star', '1138');

        $this->withToken(auth('api')->login($admin))
            ->post('/api/employee/import-account-detail', [
                'file' => $this->sheet([['1138', 'New Bank', '999999', 'SBIN0001234']]),
            ])->assertOk();

        $this->assertSame('New Bank', $ours->fresh()->bank_name);

        // Documented as-is. Change this assertion only alongside a fix.
        $this->assertSame(
            'New Bank',
            $theirs->fresh()->bank_name,
            'the cross-company row was left alone — importAccountDetail may have been scoped'
        );
        $this->assertSame('999999', $theirs->fresh()->bank_account_no);
    }

    public function test_a_row_without_an_employee_code_is_ignored(): void
    {
        $admin = $this->admin('nidhi-impex');
        $employee = $this->employee('nidhi-impex', '1138');

        $this->withToken(auth('api')->login($admin))
            ->post('/api/employee/import-account-detail', [
                'file' => $this->sheet([['', 'New Bank', '999999', 'SBIN0001234']]),
            ])->assertOk();

        $this->assertSame('Original Bank', $employee->fresh()->bank_name);
    }
}
