<?php

namespace App\Console\Commands;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimDocumentRequirement;
use App\Support\MediclaimNotifier;
use Illuminate\Console\Command;

/**
 * Daily sweep: reminds an employee, every single day, for as long as a
 * currently-required document is still missing on a claim they've
 * submitted — documents are uploaded separately from the claim request
 * itself (within 7 days of discharge, see `documents_due_at`), and this is
 * the "too important, keep nagging" mechanism that makes that deadline
 * mean something.
 *
 * Each day's reminder is deduplicated by `MediclaimNotifier::missingDocuments()`
 * itself (a fresh `mediclaim_notification_dedupe` key per calendar day) —
 * safe to run more than once a day, and this is *why* running it daily
 * actually produces a daily reminder rather than a single one.
 *
 * Scheduled daily (routes/console.php), mirroring
 * MediclaimEscalateOverdueReviews's scheduling convention.
 */
class MediclaimRemindMissingDocuments extends Command
{
    protected $signature = 'mediclaim:remind-missing-documents
                            {--dry-run : Report what would be sent without writing anything}';

    protected $description = 'Daily reminder to employees who still have required Mediclaim documents outstanding';

    /** Claims in any of these statuses can never gain more documents, so they're excluded from the sweep. */
    private const EXCLUDED_STATUSES = [
        MediclaimClaim::STATUS_DRAFT,
        MediclaimClaim::STATUS_WITHDRAWN,
        MediclaimClaim::STATUS_CANCELLED,
        MediclaimClaim::STATUS_REJECTED,
        MediclaimClaim::STATUS_CLOSED,
    ];

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $count = 0;

        $claims = MediclaimClaim::query()
            ->whereNotIn('status', self::EXCLUDED_STATUSES)
            ->whereNotNull('documents_due_at')
            ->get();

        foreach ($claims as $claim) {
            $missing = MediclaimDocumentRequirement::missingTypesFor($claim);
            if (empty($missing)) {
                continue;
            }

            $count++;

            if ($dryRun) {
                $this->line("  would remind: claim {$claim->claim_number} missing: ".implode(', ', $missing));

                continue;
            }

            MediclaimNotifier::missingDocuments($claim, $missing);
        }

        $this->info(sprintf('%s%d claim(s) reminded about missing documents.', $dryRun ? '[dry run] ' : '', $count));

        return self::SUCCESS;
    }
}
