<?php

namespace Tests\Feature\Mediclaim;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimEvent;
use App\Models\Notification;
use App\Models\ReportingRelationship;
use App\Models\User;
use App\Services\Mediclaim\ClaimWorkflowService;
use App\Support\MediclaimClaimEventLog;
use App\Support\MediclaimNotifier;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Two independent idempotency mechanisms confirmed by reading
 * app/Support/MediclaimNotifier.php directly:
 *
 * 1. Event-anchored (claimTransitioned()): an atomic
 *    `UPDATE mediclaim_claim_events SET notified_at = now() WHERE id = ? AND
 *    notified_at IS NULL`, proceeding only when exactly one row is affected.
 * 2. Time-based/cron (overdueReview() and friends): an
 *    `insertOrIgnore` into `mediclaim_notification_dedupe` on a deterministic
 *    per-day key, proceeding only when exactly one row is affected.
 */
class MediclaimNotificationIdempotencyTest extends TestCase
{
    use RefreshDatabase;

    private static int $sequence = 0;

    #[Test]
    public function replaying_the_same_claim_event_id_does_not_duplicate_notifications(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        ReportingRelationship::create([
            'employee_user_id' => $employee->id, 'manager_user_id' => $manager->id,
            'relationship_type' => ReportingRelationship::TYPE_PRIMARY, 'status' => ReportingRelationship::STATUS_ACTIVE,
            'effective_from' => now()->subDay()->toDateString(), 'effective_to' => null,
        ]);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->submit($workflow->createDraft($employee, []), $employee);

        $event = MediclaimClaimEventLog::record($claim, 'CLAIM_SUBMITTED_TEST', null, $claim->status, $employee, 'test event');
        $this->assertNull($event->notified_at);

        MediclaimNotifier::claimTransitioned($claim, 'CLAIM_SUBMITTED_TEST', null, $claim->status, $employee, $event->id);

        $afterFirst = MediclaimClaimEvent::findOrFail($event->id);
        $this->assertNotNull($afterFirst->notified_at, 'The first dispatch must claim the event via notified_at.');
        $countAfterFirst = Notification::count();

        // Replay with the SAME event id, simulating a retried/duplicated
        // trigger of the underlying transition.
        MediclaimNotifier::claimTransitioned($claim, 'CLAIM_SUBMITTED_TEST', null, $claim->status, $employee, $event->id);

        $this->assertSame(
            $afterFirst->notified_at->toDateTimeString(),
            MediclaimClaimEvent::findOrFail($event->id)->notified_at->toDateTimeString(),
            'A replay must not re-claim or re-timestamp the event.'
        );
        $this->assertSame($countAfterFirst, Notification::count(), 'A replay must not create additional notification rows.');
    }

    #[Test]
    public function a_direct_replay_of_the_atomic_notified_at_claim_only_succeeds_once(): void
    {
        $employee = $this->makeUser('Employee');
        $claim = MediclaimClaim::create([
            'company_code' => 'nidhi-impex', 'employee_user_id' => $employee->id, 'status' => MediclaimClaim::STATUS_DRAFT,
        ]);
        $event = MediclaimClaimEventLog::record($claim, 'TEST_EVENT', null, MediclaimClaim::STATUS_DRAFT, $employee);

        $firstAffected = DB::table('mediclaim_claim_events')->where('id', $event->id)->whereNull('notified_at')->update(['notified_at' => now()]);
        $secondAffected = DB::table('mediclaim_claim_events')->where('id', $event->id)->whereNull('notified_at')->update(['notified_at' => now()]);

        $this->assertSame(1, $firstAffected);
        $this->assertSame(0, $secondAffected, 'A second atomic claim against an already-notified row must affect zero rows.');
    }

    #[Test]
    public function a_cron_style_dedupe_key_prevents_a_duplicate_send_on_a_simulated_rerun(): void
    {
        $employee = $this->makeUser('Employee');
        $manager = $this->makeUser('Manager', ['role' => 1]);
        ReportingRelationship::create([
            'employee_user_id' => $employee->id, 'manager_user_id' => $manager->id,
            'relationship_type' => ReportingRelationship::TYPE_PRIMARY, 'status' => ReportingRelationship::STATUS_ACTIVE,
            'effective_from' => now()->subDay()->toDateString(), 'effective_to' => null,
        ]);

        $workflow = app(ClaimWorkflowService::class);
        $claim = $workflow->submit($workflow->createDraft($employee, []), $employee);

        $this->assertSame(
            0,
            DB::table('mediclaim_notification_dedupe')->where('dedupe_key', "overdue_review:{$claim->id}:MANAGER_REVIEW:" . now()->toDateString())->count()
        );

        // First "cron run" for today.
        MediclaimNotifier::overdueReview($claim, 'MANAGER_REVIEW', 3);

        $this->assertSame(
            1,
            DB::table('mediclaim_notification_dedupe')->where('dedupe_key', "overdue_review:{$claim->id}:MANAGER_REVIEW:" . now()->toDateString())->count()
        );
        $countAfterFirstRun = Notification::count();

        // A simulated re-run of the same cron sweep, same day.
        MediclaimNotifier::overdueReview($claim, 'MANAGER_REVIEW', 3);

        $this->assertSame(
            1,
            DB::table('mediclaim_notification_dedupe')->where('dedupe_key', "overdue_review:{$claim->id}:MANAGER_REVIEW:" . now()->toDateString())->count(),
            'The dedupe ledger must still hold exactly one row for this key.'
        );
        $this->assertSame($countAfterFirstRun, Notification::count(), 'The re-run must not create additional notification rows.');
    }

    #[Test]
    public function insert_or_ignore_against_an_existing_dedupe_key_affects_zero_rows(): void
    {
        $key = 'manual-test-dedupe-key-' . self::$sequence++;

        $first = DB::table('mediclaim_notification_dedupe')->insertOrIgnore([
            'dedupe_key' => $key, 'notification_type' => 'test', 'sent_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $second = DB::table('mediclaim_notification_dedupe')->insertOrIgnore([
            'dedupe_key' => $key, 'notification_type' => 'test', 'sent_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->assertSame(1, $first);
        $this->assertSame(0, $second);
        $this->assertSame(1, DB::table('mediclaim_notification_dedupe')->where('dedupe_key', $key)->count());
    }

    private function makeUser(string $name, array $overrides = []): User
    {
        $number = ++self::$sequence;

        return User::create($overrides + [
            'name' => $name,
            'email' => "mc-notify-{$number}@test.local",
            'password' => 'x',
            'emp_code' => "MCN{$number}",
            'role' => 3,
            'company_code' => 'nidhi-impex',
            'unit' => 'Surat',
            'status' => 0,
            'is_deleted' => 0,
        ]);
    }
}
