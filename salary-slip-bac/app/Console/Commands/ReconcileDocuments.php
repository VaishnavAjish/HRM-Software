<?php

namespace App\Console\Commands;

use App\Models\DocumentVersion;
use App\Services\Documents\DocumentService;
use Illuminate\Console\Command;
use Throwable;

/**
 * Finds and repairs drift between the database and object storage.
 *
 * Two failure shapes matter: an ACTIVE row whose object is missing (a broken
 * download waiting to happen), and a stale PENDING_UPLOAD/UPLOAD_FAILED row
 * that may have left an object behind.
 */
class ReconcileDocuments extends Command
{
    protected $signature = 'documents:reconcile
        {--fix : Apply repairs instead of only reporting}
        {--stale-minutes=60 : Age after which a PENDING_UPLOAD row is considered abandoned}';

    protected $description = 'Reconcile document metadata against object storage';

    public function handle(): int
    {
        $storage = DocumentService::provider();
        $fix = (bool) $this->option('fix');
        $staleMinutes = (int) $this->option('stale-minutes');

        $missingObjects = 0;
        $orphanObjects = 0;
        $staleReservations = 0;

        DocumentVersion::query()
            ->where('upload_status', DocumentVersion::UPLOAD_ACTIVE)
            ->orderBy('id')
            ->chunkById(200, function ($versions) use ($storage, $fix, &$missingObjects) {
                foreach ($versions as $version) {
                    try {
                        if ($storage->exists($version->s3_object_key)) {
                            continue;
                        }
                    } catch (Throwable) {
                        continue; // transient storage error — leave the row alone
                    }

                    $missingObjects++;
                    $this->line("  <fg=red>object missing</> version #{$version->id} ({$version->generated_file_name})");

                    if ($fix) {
                        $version->forceFill(['upload_status' => DocumentVersion::UPLOAD_FAILED])->save();
                    }
                }
            });

        $stale = DocumentVersion::where('upload_status', DocumentVersion::UPLOAD_PENDING)
            ->where('created_at', '<', now()->subMinutes($staleMinutes))
            ->get();

        foreach ($stale as $version) {
            $staleReservations++;
            $this->line("  <fg=yellow>stale reservation</> version #{$version->id}");

            if (!$fix) {
                continue;
            }

            try {
                if ($storage->exists($version->s3_object_key)) {
                    $storage->delete($version->s3_object_key);
                    $orphanObjects++;
                }
            } catch (Throwable $e) {
                $this->line("    could not remove object: {$e->getMessage()}");
            }

            $version->forceFill(['upload_status' => DocumentVersion::UPLOAD_FAILED])->save();
        }

        $this->newLine();
        $this->table(['Metric', 'Count'], [
            ['active rows with missing object', $missingObjects],
            ['stale pending reservations', $staleReservations],
            ['orphan objects removed', $orphanObjects],
            ['mode', $fix ? 'FIX' : 'REPORT ONLY'],
        ]);

        return self::SUCCESS;
    }
}
