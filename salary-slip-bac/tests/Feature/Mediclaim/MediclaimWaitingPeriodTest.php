<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimPolicy;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Models\User;
use App\Services\Mediclaim\PolicyEligibilityService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * PolicyEligibilityService::waitingPeriodStatus()'s `joining_date` handling.
 *
 * `joining_date` is a plain nullable `string` column on `users` (not `date`)
 * — the ONLY real source of an employee's join date here (`doj`,
 * `date_of_joining`, `date_of_appointment` aren't real columns; those old
 * fallbacks were dead code). This used to fall back to the USER ROW's
 * `created_at` whenever `joining_date` was blank — the moment the row was
 * created (a bulk import, a re-sync, ...), never the employee's actual join
 * date — which permanently denied Mediclaim ("no active Mediclaim
 * enrollment was found for this employee") to any long-tenured employee
 * whose row was created/touched recently, no matter how long they'd
 * actually worked there (2026-09-24, fix #1).
 *
 * That was then changed to fail OPEN (already eligible) on a missing
 * `joining_date`, which flipped the failure mode the other way: it also
 * silently granted Mediclaim on day one to genuinely brand-new employees
 * whose joining date just hadn't been filled in yet, which is exactly who
 * the waiting period is meant to gate (2026-09-24, fix #2). A missing
 * `joining_date` now produces a THIRD, distinct outcome —
 * `eligible: false, reason: 'missing_joining_date'` — instead of guessing
 * either direction: access stays gated, but the reason is "we don't know",
 * not a fabricated countdown.
 */
class MediclaimWaitingPeriodTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function a_genuinely_long_tenured_employee_is_eligible_even_if_their_user_row_was_created_recently(): void
    {
        $this->makeActivePolicy();
        $now = Carbon::now();

        // Real joining_date: 8 months ago. But the USER ROW itself was only
        // created 2 days ago -- e.g. re-synced from another system. Under
        // the old code this employee was treated as a brand-new joiner.
        $employee = $this->makeUser('Veteran', ['joining_date' => $now->copy()->subMonths(8)->toDateString()]);
        $employee->created_at = $now->copy()->subDays(2);
        $employee->saveQuietly();
        $employee = $employee->fresh();

        $status = app(PolicyEligibilityService::class)->waitingPeriodStatus($employee, $now);

        $this->assertTrue($status['eligible'], 'An 8-months-tenured employee must be eligible: '.json_encode($status));

        $enrollment = app(PolicyEligibilityService::class)->resolveOrCreateEnrollment($employee, $now);
        $this->assertNotNull($enrollment, 'resolveOrCreateEnrollment() must return a real enrollment, not null, for an eligible employee.');
    }

    #[Test]
    public function a_genuinely_new_joiner_is_still_correctly_held_to_the_waiting_period(): void
    {
        $this->makeActivePolicy();
        $now = Carbon::now();

        $employee = $this->makeUser('Brand New', ['joining_date' => $now->copy()->subDays(10)->toDateString()]);

        $status = app(PolicyEligibilityService::class)->waitingPeriodStatus($employee, $now);

        $this->assertFalse($status['eligible'], 'An employee who joined 10 days ago must NOT be eligible yet.');
        $this->assertNull(app(PolicyEligibilityService::class)->resolveOrCreateEnrollment($employee, $now));
    }

    #[Test]
    public function a_missing_joining_date_is_a_distinct_unknown_outcome_not_a_guess_in_either_direction(): void
    {
        $this->makeActivePolicy();
        $now = Carbon::now();

        // HR never filled in joining_date, regardless of whether the row
        // itself is old or new -- we genuinely cannot tell a long-tenured
        // employee apart from a brand-new one without the real date.
        $employee = $this->makeUser('No Join Date On File', ['joining_date' => null]);
        $employee->created_at = $now->copy()->subDays(2);
        $employee->saveQuietly();
        $employee = $employee->fresh();

        $status = app(PolicyEligibilityService::class)->waitingPeriodStatus($employee, $now);

        $this->assertFalse($status['eligible'], 'A missing joining_date must not be silently granted access: '.json_encode($status));
        $this->assertSame('missing_joining_date', $status['reason']);
        $this->assertNull(app(PolicyEligibilityService::class)->resolveOrCreateEnrollment($employee, $now));
    }

    #[Test]
    public function a_brand_new_employee_with_no_joining_date_on_file_is_not_silently_granted_day_one_access(): void
    {
        $this->makeActivePolicy();
        $now = Carbon::now();

        // The exact regression this fix targets: a genuinely brand-new
        // employee (row created today) whose joining_date HR hasn't
        // back-filled yet. The "fail open" version of this fix wrongly
        // granted them Mediclaim immediately -- exactly the case the
        // waiting period exists to gate.
        $employee = $this->makeUser('Brand New No Join Date', ['joining_date' => null]);

        $status = app(PolicyEligibilityService::class)->waitingPeriodStatus($employee, $now);
        $this->assertFalse($status['eligible'], 'A brand-new employee with no joining_date must not be granted day-one access.');
        $this->assertNull(app(PolicyEligibilityService::class)->resolveOrCreateEnrollment($employee, $now));
    }

    #[Test]
    public function filling_in_the_joining_date_immediately_resolves_the_unknown_state_to_the_real_answer(): void
    {
        $this->makeActivePolicy();
        $now = Carbon::now();

        $employee = $this->makeUser('Was Missing Now Filled', ['joining_date' => null]);
        $this->assertSame('missing_joining_date', app(PolicyEligibilityService::class)->waitingPeriodStatus($employee, $now)['reason']);

        // HR fills in the real (recent) joining date.
        $employee->joining_date = $now->copy()->subDays(10)->toDateString();
        $employee->save();
        $employee = $employee->fresh();

        $status = app(PolicyEligibilityService::class)->waitingPeriodStatus($employee, $now);
        $this->assertFalse($status['eligible']);
        $this->assertSame('waiting_period', $status['reason'], 'Once a real joining date exists, it must resolve to the genuine waiting-period reason, not stay "missing".');
        $this->assertIsInt($status['days_remaining']);
    }

    private function makeActivePolicy(): MediclaimPolicyVersion
    {
        $policy = MediclaimPolicy::create([
            'company_code' => 'wp-test-co', 'policy_code' => 'WP-TEST-'.(++self::$sequence),
            'name' => 'Waiting Period Test Policy', 'status' => 'active',
        ]);

        return MediclaimPolicyVersion::create([
            'policy_id' => $policy->id, 'version_number' => 1, 'status' => 'active',
            'rules' => ['eligibility_waiting_period_months' => 3, 'floater_limit_amount' => 300000],
            'effective_from' => Carbon::now()->subYear()->toDateString(), 'effective_to' => null,
        ]);
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-waiting-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCW{$number}",
            'role' => 3,
            'company_code' => 'wp-test-co',
            'unit' => 'Surat',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }
}
