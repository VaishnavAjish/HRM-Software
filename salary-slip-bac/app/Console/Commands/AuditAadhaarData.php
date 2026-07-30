<?php

namespace App\Console\Commands;

use App\Models\Document;
use App\Models\User;
use App\Support\AadhaarReference;
use Illuminate\Console\Command;

/**
 * Counts-only health check for stored Aadhaar values.
 *
 * Safe to run against production: it never selects a complete number into the
 * output, only aggregates and last-four groupings. Use it to size how many
 * records need manual Aadhaar re-entry before running the document
 * reconciliation, since a blank Aadhaar cannot be reconstructed from anything
 * else on the record.
 */
class AuditAadhaarData extends Command
{
    protected $signature = 'aadhaar:audit
                            {--type=appointment : Record type to audit, or "all"}
                            {--json : Emit machine-readable JSON}';

    protected $description = 'Report Aadhaar completeness by count. Never prints a full number.';

    public function handle(): int
    {
        $type = (string) $this->option('type');

        $query = User::query()->where('is_deleted', 0);
        if ($type !== 'all') {
            $query->where('type', $type);
        }

        $stats = [
            'type' => $type,
            'total' => 0,
            'valid' => 0,
            'blank' => 0,
            'invalid_length' => 0,
            'contained_formatting' => 0,
            'with_documents' => 0,
            'needs_manual_entry' => 0,
        ];

        $byDigits = [];
        $documentOwners = Document::query()
            ->select('owner_id')
            ->distinct()
            ->pluck('owner_id')
            ->flip();

        $query->select(['id', 'type', 'emp_code', 'aadhar_card_no'])
            ->orderBy('id')
            ->chunkById(500, function ($rows) use (&$stats, &$byDigits, $documentOwners) {
                foreach ($rows as $row) {
                    $stats['total']++;

                    $raw = (string) ($row->getRawOriginal('aadhar_card_no') ?? '');
                    $digits = AadhaarReference::normalise($raw);
                    $hasDocuments = $documentOwners->has($row->id);

                    if ($hasDocuments) {
                        $stats['with_documents']++;
                    }

                    if ($digits === '') {
                        $stats['blank']++;
                        $stats['needs_manual_entry']++;

                        continue;
                    }

                    if (strlen($digits) !== 12) {
                        $stats['invalid_length']++;
                        $stats['needs_manual_entry']++;

                        continue;
                    }

                    $stats['valid']++;

                    if ($raw !== $digits) {
                        // Stored with spaces or hyphens: same person, but a
                        // different folder string than a normalised write.
                        $stats['contained_formatting']++;
                    }

                    $byDigits[$digits] = ($byDigits[$digits] ?? 0) + 1;
                }
            });

        // Duplicate groups only — the key is discarded, never reported.
        $stats['duplicate_aadhaar_groups'] = count(array_filter($byDigits, fn ($n) => $n > 1));
        $stats['records_sharing_an_aadhaar'] = array_sum(array_filter($byDigits, fn ($n) => $n > 1));

        if ($this->option('json')) {
            $this->line(json_encode($stats, JSON_PRETTY_PRINT));

            return self::SUCCESS;
        }

        $this->info("Aadhaar audit — type: {$type}");
        foreach ($stats as $label => $value) {
            if ($label === 'type') {
                continue;
            }
            $this->line(sprintf('  %-28s %s', $label, $value));
        }

        if ($stats['needs_manual_entry'] > 0) {
            $this->warn(
                "{$stats['needs_manual_entry']} record(s) need an Aadhaar entered by hand. "
                .'It cannot be derived from emp_code, PAN, a mask or an existing folder.'
            );
        }

        return self::SUCCESS;
    }
}
