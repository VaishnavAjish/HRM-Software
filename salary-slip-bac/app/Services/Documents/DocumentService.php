<?php

namespace App\Services\Documents;

use App\Exceptions\DocumentException;
use App\Models\Document;
use App\Models\DocumentVersion;
use App\Models\User;
use App\Support\DocumentFileName;
use App\Support\DocumentType;
use App\Support\ObjectKeyBuilder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Upload, replace, delete, restore and URL issuance for documents.
 *
 * S3 and the database cannot share a transaction, so the flow is: reserve the
 * version inside a transaction, upload outside it, then commit the result.
 * A failure leaves an UPLOAD_FAILED row rather than an ACTIVE row pointing at
 * an object that does not exist.
 */
class DocumentService
{
    public function __construct(
        private StorageProvider $storage,
        private FileValidator $validator,
    ) {
    }

    public static function provider(): StorageProvider
    {
        return config('documents.provider') === 's3'
            ? new S3StorageProvider()
            : new LocalStorageProvider();
    }

    public static function make(): self
    {
        return new self(self::provider(), new FileValidator());
    }

    /**
     * Upload a new version of (owner, documentType), creating the logical
     * document on first use.
     *
     * @throws DocumentException
     */
    public function upload(
        UploadedFile $file,
        User $owner,
        string $documentType,
        ?int $actorId = null,
        ?string $idempotencyKey = null,
        ?string $description = null
    ): DocumentVersion {
        if (!DocumentType::isValid($documentType)) {
            throw new DocumentException(DocumentException::TYPE_INVALID, 'Unknown document type.');
        }

        // Replaying the same key must return the original result, not a new
        // version — this is what makes client retries safe.
        if ($idempotencyKey) {
            $existing = DocumentVersion::where('idempotency_key', $idempotencyKey)->first();

            if ($existing) {
                if ($existing->upload_status === DocumentVersion::UPLOAD_ACTIVE) {
                    return $existing;
                }

                throw new DocumentException(
                    DocumentException::IDEMPOTENCY_CONFLICT,
                    'A previous upload with this key is still in progress or failed.',
                    409
                );
            }
        }

        $facts = $this->validator->validate($file, $documentType);

        // Hash before the move — the temp file is gone afterwards.
        $checksum = @hash_file('sha256', $file->getPathname()) ?: null;
        $sourcePath = $file->getPathname();
        $originalName = $file->getClientOriginalName();

        [$document, $version] = $this->reserveVersion(
            $owner, $documentType, $facts, $originalName, $actorId, $idempotencyKey, $description
        );

        try {
            $result = $this->storage->put($sourcePath, $version->s3_object_key, $facts['mime']);
        } catch (Throwable $e) {
            $this->failVersion($version, $e);

            throw $e instanceof DocumentException
                ? $e
                : new DocumentException(DocumentException::UPLOAD_FAILED, 'The upload could not be completed.', 500, $e);
        }

        $scanEnabled = (bool) config('documents.malware_scan_enabled');

        $version->forceFill([
            'checksum'        => $checksum,
            'etag'            => $result['etag'] ?? null,
            's3_version_id'   => $result['version_id'] ?? null,
            'storage_class'   => $result['storage_class'] ?? null,
            'encryption_type' => $result['encryption'] ?? null,
            'kms_key_id'      => $result['kms_key_id'] ?? null,
            'bucket_name'     => config('documents.s3.bucket'),
            // With scanning on, the version stays unservable until a scanner
            // marks it clean.
            'upload_status'   => DocumentVersion::UPLOAD_ACTIVE,
            'scan_status'     => $scanEnabled ? DocumentVersion::SCAN_PENDING : DocumentVersion::SCAN_NOT_SCANNED,
            'uploaded_at'     => now(),
        ])->save();

        DB::transaction(function () use ($document, $version, $actorId) {
            $document->forceFill([
                'current_version' => max($document->current_version, $version->version),
                'status'          => Document::STATUS_ACTIVE,
                'is_deleted'      => false,
                'deleted_at'      => null,
                'deleted_by'      => null,
                'updated_by'      => $actorId,
            ])->save();
        });

        DocumentAudit::record(DocumentAudit::UPLOAD_COMPLETED, $document, $version, [
            'document_type' => $documentType,
            'version'       => $version->version,
            'size'          => $facts['size'],
            'mime_type'     => $facts['mime'],
            'checksum'      => $checksum,
        ]);

        return $version->fresh();
    }

    /**
     * Reserve the next version number under a row lock so two concurrent
     * replacements cannot both claim the same number. The unique index on
     * (document_id, version) is the backstop if a driver ignores the lock.
     */
    private function reserveVersion(
        User $owner,
        string $documentType,
        array $facts,
        string $originalName,
        ?int $actorId,
        ?string $idempotencyKey,
        ?string $description
    ): array {
        return DB::transaction(function () use ($owner, $documentType, $facts, $originalName, $actorId, $idempotencyKey, $description) {
            $ownerRef = DocumentFileName::entityId($owner->emp_code, $owner->id);

            $document = Document::where('document_type', $documentType)
                ->where(function ($q) use ($owner, $ownerRef) {
                    $owner->id ? $q->where('user_id', $owner->id) : $q->where('owner_ref', $ownerRef);
                })
                ->lockForUpdate()
                ->first();

            if (!$document) {
                $document = Document::create([
                    'organization_code' => $owner->company_code,
                    'owner_type'        => 'employee',
                    'owner_id'          => $owner->id,
                    'owner_ref'         => $ownerRef,
                    'user_id'           => $owner->id,
                    'document_type'     => $documentType,
                    'current_version'   => 0,
                    'status'            => Document::STATUS_ACTIVE,
                    'description'       => $description,
                    'created_by'        => $actorId,
                    'updated_by'        => $actorId,
                ]);
            }

            $next = (int) DocumentVersion::where('document_id', $document->id)->max('version') + 1;

            $generatedName = DocumentFileName::build(
                $ownerRef,
                $owner->name,
                $documentType,
                $next,
                $facts['extension']
            );

            $objectKey = ObjectKeyBuilder::build('employee', $ownerRef, $documentType, $generatedName);

            $version = DocumentVersion::create([
                'document_id'         => $document->id,
                'version'             => $next,
                'original_file_name'  => substr($originalName, 0, 255),
                'generated_file_name' => $generatedName,
                's3_object_key'       => $objectKey,
                'folder_path'         => dirname($objectKey),
                'file_extension'      => $facts['extension'],
                'file_size'           => $facts['size'],
                'mime_type'           => $facts['mime'],
                'upload_status'       => DocumentVersion::UPLOAD_PENDING,
                'scan_status'         => DocumentVersion::SCAN_NOT_SCANNED,
                'uploaded_by'         => $actorId,
                'idempotency_key'     => $idempotencyKey,
            ]);

            DocumentAudit::record(DocumentAudit::UPLOAD_STARTED, $document, $version, [
                'document_type' => $documentType,
                'version'       => $next,
            ]);

            return [$document, $version];
        });
    }

    /** Mark a reservation failed and clean up any partial object. */
    private function failVersion(DocumentVersion $version, Throwable $e): void
    {
        try {
            $version->forceFill(['upload_status' => DocumentVersion::UPLOAD_FAILED])->save();

            if ($this->storage->exists($version->s3_object_key)) {
                $this->storage->delete($version->s3_object_key);
            }
        } catch (Throwable $cleanupError) {
            // Reconciliation sweeps whatever cleanup could not finish.
            Log::warning('document.cleanup_failed', [
                'version_id' => $version->id,
                'reason'     => $cleanupError->getMessage(),
            ]);
        }

        DocumentAudit::record(DocumentAudit::UPLOAD_FAILED, $version->document, $version, [
            'reason' => $e instanceof DocumentException ? $e->errorCode : 'INTERNAL',
        ]);
    }

    public function viewUrl(Document $document, DocumentVersion $version): array
    {
        $this->assertServable($document, $version);

        $ttl = (int) config('documents.view_url_ttl');
        $url = $this->storage->viewUrl($version->s3_object_key, $ttl, $version->mime_type);

        DocumentAudit::record(DocumentAudit::VIEW_URL_GENERATED, $document, $version, [
            'version' => $version->version,
            'ttl'     => $ttl,
        ]);

        return ['url' => $url, 'expiresAt' => now()->addSeconds($ttl)->toIso8601String()];
    }

    public function downloadUrl(Document $document, DocumentVersion $version): array
    {
        $this->assertServable($document, $version);

        $ttl = (int) config('documents.download_url_ttl');
        $url = $this->storage->downloadUrl(
            $version->s3_object_key,
            $ttl,
            DocumentFileName::downloadName($version->generated_file_name)
        );

        DocumentAudit::record(DocumentAudit::DOWNLOAD_URL_GENERATED, $document, $version, [
            'version' => $version->version,
            'ttl'     => $ttl,
        ]);

        return ['url' => $url, 'expiresAt' => now()->addSeconds($ttl)->toIso8601String()];
    }

    /** No URL is ever signed for a document in a non-readable state. */
    private function assertServable(Document $document, DocumentVersion $version): void
    {
        if ($document->is_deleted || $document->status === Document::STATUS_DELETED) {
            throw new DocumentException(DocumentException::ALREADY_DELETED, 'This document has been deleted.', 410);
        }

        if ($document->status === Document::STATUS_QUARANTINED || $version->scan_status === DocumentVersion::SCAN_INFECTED) {
            throw new DocumentException(DocumentException::QUARANTINED, 'This document is quarantined.', 403);
        }

        if ($version->scan_status === DocumentVersion::SCAN_PENDING) {
            throw new DocumentException(DocumentException::PENDING_SCAN, 'This document is still being scanned.', 409);
        }

        if ($version->upload_status !== DocumentVersion::UPLOAD_ACTIVE) {
            throw new DocumentException(DocumentException::UPLOAD_FAILED, 'This document is not available.', 409);
        }
    }

    /**
     * Soft delete by default; ARCHIVE copies the object under archive/ then
     * removes the original (S3 has no atomic move).
     */
    public function delete(Document $document, ?int $actorId = null): void
    {
        $mode = strtoupper((string) config('documents.archive_mode', 'SOFT_DELETE'));

        if ($mode === 'ARCHIVE') {
            foreach ($document->versions as $version) {
                $archiveKey = ObjectKeyBuilder::archiveKey($version->s3_object_key);

                try {
                    $this->storage->copy($version->s3_object_key, $archiveKey);

                    if ($this->storage->exists($archiveKey)) {
                        $this->storage->delete($version->s3_object_key);
                        $version->forceFill(['s3_object_key' => $archiveKey])->save();
                    }
                } catch (Throwable $e) {
                    Log::warning('document.archive_failed', [
                        'version_id' => $version->id,
                        'reason'     => $e->getMessage(),
                    ]);
                }
            }

            DocumentAudit::record(DocumentAudit::DOCUMENT_ARCHIVED, $document, null, []);
        }

        $document->forceFill([
            'is_deleted' => true,
            'status'     => Document::STATUS_DELETED,
            'deleted_at' => now(),
            'deleted_by' => $actorId,
        ])->save();

        DocumentAudit::record(DocumentAudit::DOCUMENT_DELETED, $document, null, ['mode' => $mode]);
    }

    public function restore(Document $document, ?int $actorId = null): void
    {
        if (!$document->is_deleted) {
            throw new DocumentException(DocumentException::VERSION_CONFLICT, 'This document is not deleted.', 409);
        }

        $document->forceFill([
            'is_deleted' => false,
            'status'     => Document::STATUS_ACTIVE,
            'deleted_at' => null,
            'deleted_by' => null,
            'updated_by' => $actorId,
        ])->save();

        DocumentAudit::record(DocumentAudit::DOCUMENT_RESTORED, $document, null, []);
    }
}
