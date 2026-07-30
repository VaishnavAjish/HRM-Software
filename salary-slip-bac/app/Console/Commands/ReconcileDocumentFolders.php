<?php

namespace App\Console\Commands;

use App\Models\DocumentVersion;
use App\Services\Documents\DocumentService;
use App\Services\Documents\StorageProvider;
use App\Support\AadhaarReference;
use App\Support\ObjectKeyBuilder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Reconcile stored S3 object keys with the folder each document *should* live
 * under, and optionally move them.
 *
 * Why this exists: the folder reference is derived from the owner's Aadhaar.
 * While the edit forms were erasing Aadhaar values (see UserController::
 * withSafeAadhaar) uploads fell back to an emp_code/row-id folder. Restoring the
 * Aadhaar changes where *new* uploads go but does not move the old objects, so
 * one record can end up with documents under two prefixes.
 *
 * S3 has no atomic move. Every mode here is copy → verify → update metadata →
 * (only in FINALIZE) delete source, and every step is idempotent so a run that
 * dies half way can simply be run again.
 *
 * Modes:
 *   DRY_RUN         report only; touches nothing
 *   COPY_AND_VERIFY copy to the expected key and verify, leaving the source
 *   FINALIZE        as above, then delete verified sources
 *   ROLLBACK_REPORT list rows whose source object is still present, so a
 *                   COPY_AND_VERIFY run can be abandoned safely
 */
class ReconcileDocumentFolders extends Command
{
    protected $signature = 'documents:reconcile-folders
                            {--mode=DRY_RUN : DRY_RUN|COPY_AND_VERIFY|FINALIZE|ROLLBACK_REPORT}
                            {--limit=0 : Stop after N documents (0 = all)}
                            {--owner= : Restrict to one owner id}
                            {--json : Emit machine-readable JSON}';

    protected $description = 'Report or migrate documents whose S3 key no longer matches their owner folder.';

    private const MODES = ['DRY_RUN', 'COPY_AND_VERIFY', 'FINALIZE', 'ROLLBACK_REPORT'];

    public function handle(): int
    {
        // StorageProvider has no container binding — DocumentService picks the
        // implementation from config. Honour a binding when one exists so a test
        // can substitute a fake without touching S3.
        $storage = app()->bound(StorageProvider::class)
            ? app(StorageProvider::class)
            : DocumentService::provider();

        $mode = strtoupper((string) $this->option('mode'));

        if (! in_array($mode, self::MODES, true)) {
            $this->error('Unknown mode. Use one of: '.implode(', ', self::MODES));

            return self::FAILURE;
        }

        $limit = (int) $this->option('limit');
        $rows = [];
        $counts = array_fill_keys(
            ['scanned', 'already_correct', 'needs_migration', 'migrated', 'verified',
                'source_missing', 'destination_exists', 'conflict', 'skipped_no_aadhaar', 'failed'],
            0
        );

        $query = DocumentVersion::query()
            ->with(['document.owner'])
            ->orderBy('id');

        if ($owner = $this->option('owner')) {
            $query->whereHas('document', fn ($q) => $q->where('user_id', $owner));
        }

        $stop = false;

        $query->chunkById(200, function ($versions) use (
            &$rows, &$counts, &$stop, $storage, $mode, $limit
        ) {
            foreach ($versions as $version) {
                if ($limit > 0 && $counts['scanned'] >= $limit) {
                    $stop = true;

                    return false;
                }

                $counts['scanned']++;
                $row = $this->inspect($version);

                if ($row === null) {
                    $counts['skipped_no_aadhaar']++;

                    continue;
                }

                if (! $row['migration_required']) {
                    $counts['already_correct']++;

                    continue;
                }

                $counts['needs_migration']++;

                if ($mode !== 'DRY_RUN') {
                    $row = $this->act($storage, $version, $row, $mode, $counts);
                }

                $rows[] = $row;
            }

            return ! $stop;
        });

        return $this->report($mode, $counts, $rows);
    }

    /**
     * Compare a version's stored key with the key its owner would produce now.
     * Returns null when there is nothing meaningful to compare.
     */
    private function inspect(DocumentVersion $version): ?array
    {
        $document = $version->document;
        $owner = $document?->owner;

        if (! $document || ! $owner) {
            return null;
        }

        $currentKey = (string) $version->s3_object_key;
        if ($currentKey === '') {
            return null;
        }

        $reference = DocumentService::ownerFolderReference($owner);
        $rawAadhaar = (string) ($owner->getRawOriginal('aadhar_card_no') ?? '');
        $hasAadhaar = AadhaarReference::isValid($rawAadhaar);

        try {
            $expectedKey = ObjectKeyBuilder::appointmentKey(
                $reference,
                $document->user_id,
                (string) $document->document_type,
                (string) $version->generated_file_name,
            );
        } catch (Throwable $e) {
            return [
                'document_id' => $document->id,
                'version_id' => $version->id,
                'owner_id' => $owner->id,
                'error' => 'key_build_failed: '.$e->getMessage(),
                'migration_required' => false,
            ];
        }

        return [
            'document_id' => $document->id,
            'version_id' => $version->id,
            'owner_id' => $owner->id,
            'owner_type' => $document->owner_type,
            // Masked only — a reconciliation report is not a place for the number.
            'aadhaar_masked' => AadhaarReference::mask($rawAadhaar) ?: null,
            'has_aadhaar' => $hasAadhaar,
            'document_type' => $document->document_type,
            'current_strategy' => $this->strategyOf($currentKey, $owner, $hasAadhaar),
            'expected_strategy' => $hasAadhaar ? 'aadhaar' : 'fallback',
            'current_key_prefix' => $this->prefixOf($currentKey),
            'expected_key_prefix' => $this->prefixOf($expectedKey),
            'expected_key' => $expectedKey,
            'current_key' => $currentKey,
            'migration_required' => $currentKey !== $expectedKey,
            'status' => 'pending',
        ];
    }

    /** Perform the copy/verify/finalize work for one version. */
    private function act(
        StorageProvider $storage,
        DocumentVersion $version,
        array $row,
        string $mode,
        array &$counts
    ): array {
        $from = $row['current_key'];
        $to = $row['expected_key'];

        try {
            if ($mode === 'ROLLBACK_REPORT') {
                $row['status'] = $storage->exists($from)
                    ? 'source_still_present'
                    : 'source_gone';

                return $row;
            }

            if (! $storage->exists($from)) {
                // Metadata points at an object that is not there. Never rewrite
                // the key in that case — it would hide a missing file.
                $counts['source_missing']++;
                $row['status'] = 'source_missing';

                return $row;
            }

            if ($storage->exists($to)) {
                // Already copied by an earlier run: fall through to the metadata
                // update, which is what makes this idempotent.
                $counts['destination_exists']++;
                $row['status'] = 'destination_already_present';
            } else {
                $storage->copy($from, $to);
                $counts['migrated']++;
                $row['status'] = 'copied';
            }

            if (! $storage->exists($to)) {
                $counts['failed']++;
                $row['status'] = 'copy_not_verified';

                return $row;
            }

            $counts['verified']++;

            // Metadata moves only after the destination is confirmed present.
            $version->forceFill(['s3_object_key' => $to, 'folder_path' => $this->prefixOf($to)])->save();
            $row['status'] = 'metadata_updated';

            if ($mode === 'FINALIZE') {
                $storage->delete($from);
                $row['status'] = 'finalized';
            }

            Log::info('documents.folder_reconciled', [
                'document_id' => $row['document_id'],
                'version_id' => $row['version_id'],
                'owner_id' => $row['owner_id'],
                'mode' => $mode,
                'status' => $row['status'],
                // Prefixes only; a full key embeds the Aadhaar.
                'from_prefix' => $row['current_key_prefix'],
                'to_prefix' => $row['expected_key_prefix'],
            ]);
        } catch (Throwable $e) {
            $counts['failed']++;
            $row['status'] = 'failed';
            $row['error'] = $e->getMessage();
        }

        return $row;
    }

    private function strategyOf(string $key, $owner, bool $hasAadhaar): string
    {
        $first = explode('/', $key)[0] ?? '';

        if (str_starts_with($key, 'uploads/')) {
            return 'legacy_uploads';
        }

        if ($hasAadhaar) {
            $digits = AadhaarReference::normalise((string) $owner->getRawOriginal('aadhar_card_no'));
            if ($first === $digits || $first === AadhaarReference::secureReference($digits)) {
                return 'aadhaar';
            }
        }

        if ($owner->emp_code && $first === $owner->emp_code) {
            return 'fallback_emp_code';
        }

        if (str_starts_with($first, 'AADHAAR_')) {
            return 'aadhaar_reference_other';
        }

        return 'fallback_other';
    }

    /** Everything but the file name — safe to log, unlike a whole key. */
    private function prefixOf(string $key): string
    {
        $parts = explode('/', $key);
        array_pop($parts);

        return implode('/', $parts);
    }

    private function report(string $mode, array $counts, array $rows): int
    {
        if ($this->option('json')) {
            $this->line(json_encode(['mode' => $mode, 'counts' => $counts, 'rows' => $rows], JSON_PRETTY_PRINT));

            return self::SUCCESS;
        }

        $this->info("Document folder reconciliation — mode: {$mode}");
        foreach ($counts as $label => $value) {
            $this->line(sprintf('  %-22s %s', $label, $value));
        }

        if ($rows) {
            $this->newLine();
            $this->table(
                ['Doc', 'Owner', 'Masked', 'Type', 'Current', 'Expected', 'Status'],
                array_map(fn ($r) => [
                    $r['document_id'] ?? '—',
                    $r['owner_id'] ?? '—',
                    $r['aadhaar_masked'] ?? '—',
                    $r['document_type'] ?? '—',
                    $r['current_strategy'] ?? '—',
                    $r['expected_strategy'] ?? '—',
                    $r['status'] ?? '—',
                ], array_slice($rows, 0, 50)),
            );

            if (count($rows) > 50) {
                $this->warn('Showing the first 50 of '.count($rows).' rows. Use --json for the full set.');
            }
        }

        if ($mode === 'DRY_RUN' && $counts['needs_migration'] > 0) {
            $this->newLine();
            $this->warn('Nothing was changed. Re-run with --mode=COPY_AND_VERIFY, check the report, then --mode=FINALIZE.');
        }

        return self::SUCCESS;
    }
}
