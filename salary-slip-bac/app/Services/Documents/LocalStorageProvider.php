<?php

namespace App\Services\Documents;

use App\Exceptions\DocumentException;
use App\Support\ObjectKeyBuilder;

/**
 * Filesystem provider retained only so DOCUMENT_STORAGE_PROVIDER=local keeps
 * working during rollout and in environments without AWS credentials.
 *
 * It is not the production path: files land under public/ and its "presigned"
 * URLs are ordinary signed application URLs with no real expiry enforcement at
 * the storage layer. Prefer S3 everywhere it is available.
 */
class LocalStorageProvider implements StorageProvider
{
    private function absolute(string $objectKey): string
    {
        ObjectKeyBuilder::assertSafe($objectKey);

        return public_path('uploads/' . $objectKey);
    }

    public function put(string $sourcePath, string $objectKey, string $mimeType): array
    {
        $target = $this->absolute($objectKey);
        $dir = dirname($target);

        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            throw new DocumentException(
                DocumentException::UPLOAD_FAILED,
                'Could not create the storage directory.',
                500
            );
        }

        if (!@rename($sourcePath, $target) && !@copy($sourcePath, $target)) {
            throw new DocumentException(
                DocumentException::UPLOAD_FAILED,
                'Could not write the uploaded file.',
                500
            );
        }

        return [
            'etag'          => @md5_file($target) ?: null,
            'version_id'    => null,
            'storage_class' => 'LOCAL',
            'encryption'    => null,
            'kms_key_id'    => null,
        ];
    }

    public function exists(string $objectKey): bool
    {
        return is_file($this->absolute($objectKey));
    }

    public function delete(string $objectKey): void
    {
        $path = $this->absolute($objectKey);

        if (is_file($path)) {
            @unlink($path);
        }
    }

    public function copy(string $fromKey, string $toKey): void
    {
        $target = $this->absolute($toKey);
        $dir = dirname($target);

        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        @copy($this->absolute($fromKey), $target);
    }

    public function viewUrl(string $objectKey, int $ttlSeconds, string $mimeType): string
    {
        ObjectKeyBuilder::assertSafe($objectKey);

        return url('/uploads/' . $objectKey);
    }

    public function downloadUrl(string $objectKey, int $ttlSeconds, string $downloadName): string
    {
        return $this->viewUrl($objectKey, $ttlSeconds, '');
    }

    public function healthy(): bool
    {
        return is_dir(public_path('uploads')) || @mkdir(public_path('uploads'), 0755, true);
    }
}
