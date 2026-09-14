<?php

namespace Tests\Feature\Mediclaim;

use App\Support\MediclaimClaimNumber;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * MediclaimClaimNumber::next() — per-company+year counter, exact format
 * `MC-{COMPANY}-{YEAR}-{000001}` (confirmed by reading
 * app/Support/MediclaimClaimNumber.php directly), keyed by
 * `period_key = "{COMPANY}:{YEAR}"` against `mediclaim_claim_number_counters`.
 */
class MediclaimClaimNumberAllocationTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function twenty_sequential_allocations_in_one_company_are_strictly_unique_and_ordered(): void
    {
        $numbers = [];
        for ($i = 0; $i < 20; $i++) {
            $numbers[] = MediclaimClaimNumber::next('nidhi-impex');
        }

        $this->assertCount(20, array_unique($numbers), 'All 20 allocations must be unique.');

        $year = (int) date('Y');
        for ($i = 0; $i < 20; $i++) {
            $expected = sprintf('MC-NIDHI-IMPEX-%d-%06d', $year, $i + 1);
            $this->assertSame($expected, $numbers[$i]);
        }
    }

    #[Test]
    public function numbering_is_scoped_per_company_two_companies_do_not_share_a_sequence(): void
    {
        $year = (int) date('Y');

        $nidhiFirst = MediclaimClaimNumber::next('nidhi-impex');
        $silverFirst = MediclaimClaimNumber::next('silver-star');
        $nidhiSecond = MediclaimClaimNumber::next('nidhi-impex');
        $silverSecond = MediclaimClaimNumber::next('silver-star');

        $this->assertSame("MC-NIDHI-IMPEX-{$year}-000001", $nidhiFirst);
        $this->assertSame("MC-SILVER-STAR-{$year}-000001", $silverFirst, 'A different company must start its own sequence at 1, unaffected by the first company already having allocated one.');
        $this->assertSame("MC-NIDHI-IMPEX-{$year}-000002", $nidhiSecond);
        $this->assertSame("MC-SILVER-STAR-{$year}-000002", $silverSecond);
    }

    #[Test]
    public function numbering_is_also_scoped_per_year(): void
    {
        $thisYearFirst = MediclaimClaimNumber::next('nidhi-impex', 2026);
        $nextYearFirst = MediclaimClaimNumber::next('nidhi-impex', 2027);
        $thisYearSecond = MediclaimClaimNumber::next('nidhi-impex', 2026);

        $this->assertSame('MC-NIDHI-IMPEX-2026-000001', $thisYearFirst);
        $this->assertSame('MC-NIDHI-IMPEX-2027-000001', $nextYearFirst, 'A different year for the SAME company must start its own sequence at 1.');
        $this->assertSame('MC-NIDHI-IMPEX-2026-000002', $thisYearSecond);
    }

    #[Test]
    public function the_underlying_counter_table_holds_one_row_per_period_key(): void
    {
        MediclaimClaimNumber::next('nidhi-impex', 2026);
        MediclaimClaimNumber::next('nidhi-impex', 2026);
        MediclaimClaimNumber::next('nidhi-impex', 2027);
        MediclaimClaimNumber::next('silver-star', 2026);

        $this->assertDatabaseHas('mediclaim_claim_number_counters', ['period_key' => 'NIDHI-IMPEX:2026', 'current_value' => 2]);
        $this->assertDatabaseHas('mediclaim_claim_number_counters', ['period_key' => 'NIDHI-IMPEX:2027', 'current_value' => 1]);
        $this->assertDatabaseHas('mediclaim_claim_number_counters', ['period_key' => 'SILVER-STAR:2026', 'current_value' => 1]);
    }
}
