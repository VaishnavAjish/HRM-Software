<?php

namespace App\Console\Commands;

use App\Models\Mediclaim\MediclaimClaim;
use App\Support\MediclaimNotifier;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * Daily sweep: nudges whoever currently holds a Mediclaim claim that has sat
 * too long at its current review stage.
 *
 * Uses `updated_at` as a proxy for "time at the current stage" — the claim
 * row is saved every time `ClaimWorkflowService` transitions its `status`,
 * so `updated_at` is a reasonable stand-in for "when this stage started"
 * without needing a dedicated per-stage timestamp column (none exists on
 * `mediclaim_claims`; the fully-accurate source would be the most recent
 * `mediclaim_claim_events` row for the claim, which this sweep does not
 * query per-claim to keep the check cheap — flagged as a simplification,
 * not a hidden bug: a claim edited by something other than a status change
 * would reset this clock, but nothing else currently touches `updated_at`
 * on a claim already past DRAFT).
 *
 * Each reminder is deduplicated per calendar day by
 * MediclaimNotifier::overdueReview() (via `mediclaim_notification_dedupe`)
 * — safe to run more than once a day.
 *
 * Scheduled daily (routes/console.php), mirroring EscalateOverdueTickets's
 * scheduling convention.
 */
class MediclaimEscalateOverdueReviews extends Command
{
    protected $signature = 'mediclaim:escalate-overdue-reviews
                            {--dry-run : Report what would be sent without writing anything}';

    protected $description = 'Remind reviewers about Mediclaim claims overdue at their current review stage';

    /** Stage => days a claim may sit there before it is considered overdue. */
    private const STAGE_THRESHOLDS = [
        MediclaimClaim::STATUS_MANAGER_REVIEW => 3,
        MediclaimClaim::STATUS_COORDINATOR_VERIFICATION => 3,
        MediclaimClaim::STATUS_COMMITTEE_RECOMMENDATION => 5,
        MediclaimClaim::STATUS_HR_ELIGIBILITY_VERIFICATION => 3,
        MediclaimClaim::STATUS_DIRECTOR_FINAL_APPROVAL => 5,
    ];

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $count = 0;

        foreach (self::STAGE_THRESHOLDS as $status => $days) {
            $cutoff = Carbon::now()->subDays($days);

            $claims = MediclaimClaim::query()
                ->where('status', $status)
                ->where('updated_at', '<', $cutoff)
                ->get();

            foreach ($claims as $claim) {
                $count++;
                $daysOverdue = (int) Carbon::parse($claim->updated_at)->diffInDays(now());

                if ($dryRun) {
                    $this->line("  would remind: claim {$claim->claim_number} overdue at {$status} ({$daysOverdue}d)");

                    continue;
                }

                MediclaimNotifier::overdueReview($claim, $status, $daysOverdue);
            }
        }

        $this->info(sprintf('%s%d claim(s) flagged overdue.', $dryRun ? '[dry run] ' : '', $count));

        return self::SUCCESS;
    }
}
