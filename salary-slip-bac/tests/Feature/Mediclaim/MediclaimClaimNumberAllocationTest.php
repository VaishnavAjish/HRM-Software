<?php

namespace Tests\Feature\Mediclaim;

use App\Models\User;
use App\Support\MediclaimClaimNumber;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * MediclaimClaimNumber::next() - company + branch prefix and employee code formatting:
 * - Nidhi Impex + Shreeji -> NS-{EMP_CODE}-{YYYY-MM-DD}
 * - Nidhi Impex + Ichapur -> NI-{EMP_CODE}-{YYYY-MM-DD}
 * - Silver Star + Daduk   -> SD-{EMP_CODE}-{YYYY-MM-DD}
 * - Silver Star + Ichapur -> SI-{EMP_CODE}-{YYYY-MM-DD}
 */
class MediclaimClaimNumberAllocationTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function resolves_correct_prefix_for_company_and_branch(): void
    {
        $this->assertSame('NS', MediclaimClaimNumber::resolvePrefix('Nidhi Impex', 'Shreeji'));
        $this->assertSame('NI', MediclaimClaimNumber::resolvePrefix('Nidhi Impex', 'Ichapur'));
        $this->assertSame('SD', MediclaimClaimNumber::resolvePrefix('Silver Star', 'Daduk'));
        $this->assertSame('SI', MediclaimClaimNumber::resolvePrefix('Silver Star', 'Ichapur'));
    }

    #[Test]
    public function allocates_claim_number_with_exact_requested_format(): void
    {
        $date = '2026-09-21';

        $u1 = new User(['emp_code' => '1001', 'company_code' => 'nidhi-impex', 'unit' => 'Shreeji']);
        $this->assertSame('NS-1001-2026-09-21', MediclaimClaimNumber::next('nidhi-impex', $u1, $date));

        $u2 = new User(['emp_code' => '1002', 'company_code' => 'nidhi-impex', 'unit' => 'Ichapur']);
        $this->assertSame('NI-1002-2026-09-21', MediclaimClaimNumber::next('nidhi-impex', $u2, $date));

        $u3 = new User(['emp_code' => '2001', 'company_code' => 'silver-star', 'unit' => 'Daduk']);
        $this->assertSame('SD-2001-2026-09-21', MediclaimClaimNumber::next('silver-star', $u3, $date));

        $u4 = new User(['emp_code' => '2002', 'company_code' => 'silver-star', 'unit' => 'Ichapur']);
        $this->assertSame('SI-2002-2026-09-21', MediclaimClaimNumber::next('silver-star', $u4, $date));
    }
}
