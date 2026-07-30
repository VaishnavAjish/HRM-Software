<?php

namespace App\Console\Commands;

use App\Models\User;
use App\Support\AadhaarReference;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Encrypts existing plaintext Aadhaar numbers and derives their storage
 * reference.
 *
 * Rows keep working without this — DocumentService derives the reference on the
 * fly — but until it runs the number sits in plaintext in aadhar_card_no and
 * there is no unique constraint protecting against two records claiming the
 * same folder.
 *
 * Idempotent: rows that already carry a secure reference are skipped, so it can
 * be re-run safely and resumed after an interruption.
 */
class BackfillAadhaarReferences extends Command
{
    protected $signature = 'documents:backfill-aadhaar
        {--dry-run : Report what would change without writing}
        {--batch=200 : Rows per chunk}';

    protected $description = 'Encrypt plaintext Aadhaar numbers and derive secure storage references';

    public function handle(): int
    {
        if (!config('documents.aadhaar_reference_secret')) {
            $this->error('AADHAAR_REFERENCE_SECRET is not configured — references would not be reproducible.');

            return self::FAILURE;
        }

        $dryRun = (bool) $this->option('dry-run');
        $report = ['scanned' => 0, 'backfilled' => 0, 'already_done' => 0, 'invalid' => 0, 'missing' => 0, 'duplicates' => 0, 'failed' => 0];

        // A dry run writes nothing, so a clash between two rows in the same run
        // would go unseen and the report would disagree with the real thing.
        // Track what would have been claimed.
        $wouldClaim = [];

        User::query()
            ->whereNull('aadhaar_secure_reference')
            ->orderBy('id')
            ->chunkById((int) $this->option('batch'), function ($users) use (&$report, $dryRun, &$wouldClaim) {
                foreach ($users as $user) {
                    $report['scanned']++;

                    // getRawOriginal bypasses the masking accessor.
                    $raw = $user->getRawOriginal('aadhar_card_no');

                    if (!$raw) {
                        $report['missing']++;
                        continue;
                    }

                    if (!AadhaarReference::isValid($raw)) {
                        $report['invalid']++;
                        // The number itself is never printed.
                        $this->line("  <fg=yellow>invalid</> user #{$user->id}");
                        continue;
                    }

                    $digits = AadhaarReference::normalise($raw);
                    $reference = AadhaarReference::secureReference($digits);

                    // Duplicates are recorded but no longer skipped: object
                    // keys include the appointment id, so two records sharing an
                    // Aadhaar number get separate folders. Blocking them here
                    // only prevented them from uploading anything at all.
                    $clashId = User::where('aadhaar_secure_reference', $reference)
                        ->where('id', '!=', $user->id)
                        ->value('id') ?? ($wouldClaim[$reference] ?? null);

                    if ($clashId) {
                        $report['duplicates']++;
                        $this->line("  <fg=yellow>shared Aadhaar</> user #{$user->id} also on #{$clashId} (separate folders, review advised)");
                    }

                    $wouldClaim[$reference] = $user->id;

                    if ($dryRun) {
                        $report['backfilled']++;
                        $this->line("  would backfill user #{$user->id} -> {$reference}");
                        continue;
                    }

                    try {
                        DB::transaction(function () use ($user, $digits, $reference) {
                            $user->forceFill([
                                'encrypted_aadhaar_number'    => $digits,
                                'aadhaar_last_four'           => substr($digits, -4),
                                'aadhaar_secure_reference'    => $reference,
                                'aadhaar_extraction_source'   => 'IMPORT',
                                'aadhaar_extracted_at'        => now(),
                                'aadhaar_verification_status' => 'UNVERIFIED',
                            ])->save();
                        });

                        $report['backfilled']++;
                    } catch (Throwable $e) {
                        $report['failed']++;
                        $this->line("  <fg=red>failed</> user #{$user->id}: " . AadhaarReference::redact($e->getMessage()));
                    }
                }
            });

        $report['already_done'] = User::whereNotNull('aadhaar_secure_reference')->count();

        $this->newLine();
        $this->info($dryRun ? 'Backfill report (DRY RUN)' : 'Backfill report');
        $this->table(
            ['Metric', 'Count'],
            array_map(fn ($k, $v) => [str_replace('_', ' ', $k), $v], array_keys($report), $report)
        );

        if (!$dryRun && $report['backfilled'] > 0) {
            $this->warn('aadhar_card_no still holds the plaintext number. Drop it only after verifying these rows.');
        }

        return self::SUCCESS;
    }
}
