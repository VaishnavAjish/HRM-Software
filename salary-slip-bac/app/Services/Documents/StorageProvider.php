<?php

namespace App\Services\Documents;

interface StorageProvider
{
    /**
     * Persist the file at $sourcePath under $objectKey.
     *
     * @return array{etag:?string,version_id:?string,storage_class:?string,encryption:?string,kms_key_id:?string}
     */
    public function put(string $sourcePath, string $objectKey, string $mimeType): array;

    public function exists(string $objectKey): bool;

    public function delete(string $objectKey): void;

    /** Server-side copy; S3 has no atomic move, so callers copy then delete. */
    public function copy(string $fromKey, string $toKey): void;

    /** Short-lived URL rendering the object inline in the browser. */
    public function viewUrl(string $objectKey, int $ttlSeconds, string $mimeType): string;

    /** Short-lived URL forcing a download with the given filename. */
    public function downloadUrl(string $objectKey, int $ttlSeconds, string $downloadName): string;

    /** Cheap connectivity/config probe for health checks. */
    public function healthy(): bool;
}
