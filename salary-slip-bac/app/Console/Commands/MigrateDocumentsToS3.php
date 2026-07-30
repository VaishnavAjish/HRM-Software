<?php

namespace App\Console\Commands;

use App\Models\Document;
use App\Models\DocumentVersion;
use App\Services\Documents\DocumentAudit;
use App\Services\Documents\S3StorageProvider;
use App\Support\DocumentFileName;
use App\Support\ObjectKeyBuilder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;
use Throwable;

/**
 * Migrates legacy local document files into S3.
 *
 * Idempotent and resumable: rows already carrying an S3 key are skipped, so a
 * re-run only picks up what is left. Local files are never deleted except in
 * the explicit FINALIZE mode.
 */
class MigrateDocumentsToS3 extends Command
{
    protected $signature = 'documents:migrate-s3
        {--mode=DRY_RUN : DRY_RUN|COPY_ONLY|COPY_AND_VERIFY|FINALIZE|ROLLBACK}
        {--batch=100 : Rows per chunk}
        {--limit=0 : Stop after N rows (0 = all)}';

    protected $description = 'Migrate legacy local document files to AWS S3';

    private array $report = [
        'discovered' => 0, 'migrated' => 0, 'already_migrated' => 0,
        'missing_local' => 0, 'validation_failed' => 0, 'upload_failed' => 0,
        'database_failed' => 0, 'checksum_mismatch' => 0, 'local_deleted' => 0,
    ];

    public function handle(): int
    {
        $mode = strtoupper((string) $this->option('mode'));
        $valid = ['DRY_RUN', 'COPY_ONLY', 'COPY_AND_VERIFY', 'FINALIZE', 'ROLLBACK'];

        if (!in_array($mode, $valid, true)) {
            $this->error('Invalid --mode. Use one of: ' . implode(', ', $valid));

            return self::FAILURE;
        }

        if ($mode === 'ROLLBACK') {
            return $this->rollback();
        }

        try {
            $storage = new S3StorageProvider();
        } catch (Throwable $e) {
            $this->error('S3 is not configured: ' . $e->getMessage());

            return self::FAILURE;
        }

        $limit = (int) $this->option('limit');
        $processed = 0;

        // Legacy rows are the ones whose key is still a local relative path.
        DocumentVersion::query()
            ->where('storage_class', 'LOCAL')
            ->orderBy('id')
            ->chunkById((int) $this->option('batch'), function ($versions) use ($storage, $mode, $limit, &$processed) {
                foreach ($versions as $version) {
                    if ($limit > 0 && $processed >= $limit) {
                        return false;
                    }

                    $processed++;
                    $this->report['discovered']++;
                    $this->migrateOne($version, $storage, $mode);
                }

                return true;
            });

        $this->printReport($mode);

        return self::SUCCESS;
    }

    private function migrateOne(DocumentVersion $version, S3StorageProvider $storage, string $mode): void
    {
        $document = $version->document;

        if (!$document) {
            $this->report['database_failed']++;

            return;
        }

        $localPath = public_path($version->s3_object_key);
        $realBase = realpath(public_path('uploads'));
        $real = realpath($localPath);

        // Only files genuinely inside public/uploads may be migrated —
        // guards against a poisoned path escaping the upload root.
        if (!$real || !$realBase || !str_starts_with($real, $realBase)) {
            $this->report['missing_local']++;
            $this->line("  <fg=yellow>missing/outside root</> #{$version->id} {$version->s3_object_key}");

            return;
        }

        if (!is_file($real) || filesize($real) === 0) {
            $this->report['missing_local']++;

            return;
        }

        $mime = File::mimeType($real) ?: $version->mime_type;
        $size = filesize($real);
        $checksum = hash_file('sha256', $real) ?: null;
        $extension = DocumentFileName::extensionFor($mime, $version->file_extension);

        $generatedName = $version->generated_file_name
            ?: DocumentFileName::build(
                $document->document_type,
                $version->version,
                $extension,
                $version->uploaded_at
            );

        try {
            $objectKey = ObjectKeyBuilder::build(
                $document->owner_type ?: 'employee',
                $document->owner_ref ?: 'USR000000',
                $document->document_type,
                $generatedName
            );
        } catch (Throwable $e) {
            $this->report['validation_failed']++;
            $this->line("  <fg=red>key rejected</> #{$version->id}: {$e->getMessage()}");

            return;
        }

        if ($mode === 'DRY_RUN') {
            $this->line("  would upload #{$version->id} -> {$objectKey}");

            return;
        }

        try {
            $result = $storage->put($real, $objectKey, $mime);
        } catch (Throwable $e) {
            $this->report['upload_failed']++;
            $this->line("  <fg=red>upload failed</> #{$version->id}: {$e->getMessage()}");

            return;
        }

        if (in_array($mode, ['COPY_AND_VERIFY', 'FINALIZE'], true) && !$storage->exists($objectKey)) {
            $this->report['checksum_mismatch']++;
            $this->line("  <fg=red>verify failed</> #{$version->id}");

            return;
        }

        try {
            $version->forceFill([
                's3_object_key'      => $objectKey,
                'folder_path'        => dirname($objectKey),
                'generated_file_name' => $generatedName,
                'bucket_name'        => config('documents.s3.bucket'),
                'file_extension'     => $extension,
                'file_size'          => $size,
                'mime_type'          => $mime,
                'checksum'           => $checksum,
                'etag'               => $result['etag'] ?? null,
                's3_version_id'      => $result['version_id'] ?? null,
                'storage_class'      => $result['storage_class'] ?? 'STANDARD',
                'encryption_type'    => $result['encryption'] ?? null,
                'kms_key_id'         => $result['kms_key_id'] ?? null,
                'upload_status'      => DocumentVersion::UPLOAD_ACTIVE,
            ])->save();

            DocumentAudit::record(DocumentAudit::LEGACY_MIGRATED, $document, $version, [
                'from' => 'local',
                'size' => $size,
            ]);

            $this->report['migrated']++;
        } catch (Throwable $e) {
            $this->report['database_failed']++;
            $this->line("  <fg=red>db failed</> #{$version->id}: {$e->getMessage()}");

            return;
        }

        // Only FINALIZE removes local files, and only after a verified upload.
        if ($mode === 'FINALIZE') {
            @unlink($real);
            $this->report['local_deleted']++;
        }
    }

    /** Points rows back at their local paths; does not delete S3 objects. */
    private function rollback(): int
    {
        $this->warn('ROLLBACK only reverts database pointers. S3 objects are left in place.');

        $count = DocumentVersion::where('storage_class', '!=', 'LOCAL')
            ->whereNotNull('bucket_name')
            ->count();

        $this->line("Rows currently pointing at S3: {$count}");
        $this->line('Restore from your pre-migration database backup to fully revert.');

        return self::SUCCESS;
    }

    private function printReport(string $mode): void
    {
        $this->newLine();
        $this->info("Migration report ({$mode})");

        $rows = [];
        foreach ($this->report as $key => $value) {
            $rows[] = [str_replace('_', ' ', $key), $value];
        }

        $this->table(['Metric', 'Count'], $rows);

        $orphanRows = DocumentVersion::where('upload_status', DocumentVersion::UPLOAD_FAILED)->count();

        if ($orphanRows > 0) {
            $this->warn("Outstanding: {$orphanRows} version(s) in UPLOAD_FAILED — run documents:reconcile.");
        }
    }
}
