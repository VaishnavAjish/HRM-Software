<?php

namespace App\Console\Commands;

use App\Models\Mediclaim\MediclaimCard;
use App\Models\Mediclaim\MediclaimMember;
use App\Models\Mediclaim\MediclaimPolicyVersion;
use App\Support\MediclaimNotifier;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Daily sweep: reminds the relevant people about Mediclaim policies, cards,
 * and covered-member eligibility windows approaching expiry.
 *
 * Every reminder this command triggers is deduplicated per calendar day by
 * MediclaimNotifier (policyExpiring()/cardExpiring()/memberEligibilityExpiring(),
 * via the `mediclaim_notification_dedupe` ledger) — safe to run more than
 * once a day, and safe to re-run after a failure, since a reminder already
 * sent today simply no-ops the second time.
 *
 * Scheduled daily (routes/console.php), mirroring EscalateOverdueTickets's
 * scheduling convention.
 */
class MediclaimSendExpiryReminders extends Command
{
    protected $signature = 'mediclaim:send-expiry-reminders
                            {--dry-run : Report what would be sent without writing anything}';

    protected $description = 'Notify about Mediclaim policies, cards, and member eligibility windows approaching expiry';

    /** Reminder windows, in days before expiry, checked for policies and cards. */
    private const POLICY_WINDOWS = [30, 15, 7];

    private const CARD_WINDOWS = [30, 15, 7];

    /** How far ahead to look for a member about to age out of eligibility. */
    private const MEMBER_ELIGIBILITY_WINDOW_DAYS = 30;

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $policies = $this->remindPolicies($dryRun);
        $cards = $this->remindCards($dryRun);
        $members = $this->remindMemberEligibility($dryRun);

        $this->info(sprintf(
            '%s%d polic(y/ies), %d card(s), %d member(s) reminded.',
            $dryRun ? '[dry run] ' : '',
            $policies,
            $cards,
            $members
        ));

        return self::SUCCESS;
    }

    private function remindPolicies(bool $dryRun): int
    {
        $count = 0;
        $today = Carbon::today();

        foreach (self::POLICY_WINDOWS as $days) {
            $targetDate = $today->copy()->addDays($days)->toDateString();

            $versions = MediclaimPolicyVersion::query()
                ->where('status', 'active')
                ->whereDate('effective_to', $targetDate)
                ->get();

            foreach ($versions as $version) {
                $count++;

                if ($dryRun) {
                    $this->line("  would remind: policy version #{$version->id} expires in {$days} day(s)");

                    continue;
                }

                MediclaimNotifier::policyExpiring($version, $days);
            }
        }

        return $count;
    }

    private function remindCards(bool $dryRun): int
    {
        $count = 0;
        $today = Carbon::today();

        foreach (self::CARD_WINDOWS as $days) {
            $targetDate = $today->copy()->addDays($days)->toDateString();

            $cards = MediclaimCard::query()
                ->where('status', 'active')
                ->whereDate('valid_to', $targetDate)
                ->get();

            foreach ($cards as $card) {
                $count++;

                if ($dryRun) {
                    $this->line("  would remind: card #{$card->id} expires in {$days} day(s)");

                    continue;
                }

                MediclaimNotifier::cardExpiring($card, $days);
            }
        }

        return $count;
    }

    /**
     * A covered child/parent approaching the policy's max-age cutoff.
     *
     * `date_of_birth` + the policy version's `child_max_age_years`/
     * `parent_max_age_years` gives the date the member ages out; if that
     * date falls inside the reminder window, warn now — while there is still
     * time to act — rather than only after a claim is affected.
     *
     * A member's applicable policy version is resolved via their enrollment
     * (`member->enrollment->policyVersion`), not `PolicyEligibilityService`'s
     * date-scoped resolver: that resolver answers "which version covered a
     * given past treatment date" and is deliberately not reused here, since
     * this sweep is about the member's *current* enrollment, not a specific
     * claim's treatment date.
     */
    private function remindMemberEligibility(bool $dryRun): int
    {
        $count = 0;
        $today = Carbon::today();
        $horizon = $today->copy()->addDays(self::MEMBER_ELIGIBILITY_WINDOW_DAYS);

        $members = MediclaimMember::query()
            ->where('status', 'active')
            ->whereIn('relationship_type', ['child', 'parent'])
            ->whereNotNull('date_of_birth')
            ->with('enrollment.policyVersion')
            ->get();

        foreach ($members as $member) {
            $version = $member->enrollment?->policyVersion;

            if (! $version) {
                continue;
            }

            $rules = $version->rules ?? [];
            $maxAge = $member->relationship_type === 'child'
                ? ($rules['child_max_age_years'] ?? null)
                : ($rules['parent_max_age_years'] ?? null);

            if ($maxAge === null) {
                continue;
            }

            $ageOutDate = Carbon::parse($member->date_of_birth)->addYears((int) $maxAge);

            if ($ageOutDate->lt($today) || $ageOutDate->gt($horizon)) {
                continue;
            }

            $count++;

            if ($dryRun) {
                $this->line("  would remind: member #{$member->id} ages out on {$ageOutDate->toDateString()}");

                continue;
            }

            $daysRemaining = (int) $today->diffInDays($ageOutDate);
            $reason = $member->relationship_type === 'child'
                ? "A covered child's eligibility ends in {$daysRemaining} day(s) under the policy's maximum covered age."
                : "A covered parent's eligibility ends in {$daysRemaining} day(s) under the policy's maximum covered age.";

            MediclaimNotifier::memberEligibilityExpiring($member, $reason, $ageOutDate);
        }

        return $count;
    }
}
