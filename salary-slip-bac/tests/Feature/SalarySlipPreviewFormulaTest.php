<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use Tests\TestCase;

/**
 * The upload preview used to be parsed entirely client-side with ExcelJS,
 * which has no formula engine: a formula cell with no cached result (common
 * when a formula is dragged down without Excel recalculating) rendered as
 * the literal text "[object Object]", and the file rebuilt from that preview
 * for upload carried the same corrupted value into the database. The
 * /admin/salary-slip/preview endpoint parses with PhpSpreadsheet instead,
 * which does calculate formulas, so the preview matches what import saves.
 */
class SalarySlipPreviewFormulaTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::create([
            'name' => 'Admin', 'email' => 'slip-preview-admin@test.local',
            'password' => 'x', 'role' => 0, 'company_code' => 'silver-star',
            'emp_code' => 'ADM1', 'status' => 0, 'is_deleted' => 0,
        ]);
    }

    /** A sheet with an uncalculated formula cell, exactly like a dragged-down "Leave" column. */
    private function sheetWithUncachedFormula(): UploadedFile
    {
        $spreadsheet = new Spreadsheet;
        $sheet = $spreadsheet->getActiveSheet();

        $sheet->setCellValue('A1', 'Working Days');
        $sheet->setCellValue('B1', 'Present Days');
        $sheet->setCellValue('C1', 'Leave');

        $sheet->setCellValue('A2', 26);
        $sheet->setCellValue('B2', 26);
        $sheet->setCellValue('C2', '=A2-B2'); // full attendance -> 0

        $sheet->setCellValue('A3', 26);
        $sheet->setCellValue('B3', 3.5);
        $sheet->setCellValue('C3', '=A3-B3'); // partial attendance -> 22.5

        $path = tempnam(sys_get_temp_dir(), 'slip_preview').'.xlsx';
        (new Xlsx($spreadsheet))->save($path);

        return new UploadedFile($path, 'salary.xlsx', null, null, true);
    }

    public function test_preview_calculates_uncached_formula_results(): void
    {
        $admin = $this->admin();

        $response = $this->withToken(auth('api')->login($admin))
            ->post('/api/admin/salary-slip/preview', [
                'salary_slip' => $this->sheetWithUncachedFormula(),
            ]);

        $response->assertOk();
        $response->assertJson(['status' => true]);

        $rows = $response->json('rows');
        $this->assertCount(2, $rows);

        // Row 1: full attendance -> Leave computed as 0, not blank/"[object Object]".
        $this->assertEquals(26, $rows[0][0]);
        $this->assertEquals(26, $rows[0][1]);
        $this->assertEquals(0, $rows[0][2]);
        $this->assertNotSame('', $rows[0][2], 'Leave should be the computed 0, not blanked out');

        // Row 2: partial attendance -> Leave computed as 22.5.
        $this->assertEquals(26, $rows[1][0]);
        $this->assertEquals(3.5, $rows[1][1]);
        $this->assertEquals(22.5, $rows[1][2]);
    }
}
