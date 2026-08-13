<?php

namespace App\Services\Documents;

use App\Exceptions\DocumentException;
use App\Support\ObjectKeyBuilder;
use Illuminate\Support\Facades\URL;

/**
 * Filesystem provider retained only so DOCUMENT_STORAGE_PROVIDER=local keeps
 * working during rollout and in environments without AWS credentials.
 *
 * Files live under storage/app/private/uploads (never the public webroot) and
 * are served through the signed local-documents.view route, so a URL expires
 * like an S3 presigned link and nothing is fetchable without one.
 */
class LocalStorageProvider implements StorageProvider
{
    private function absolute(string $objectKey): string
    {
        ObjectKeyBuilder::assertSafe($objectKey);

        return storage_path('app/private/uploads/' . $objectKey);
    }

    private function legacyPublicPath(string $objectKey): string
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
        return is_file($this->absolute($objectKey)) || is_file($this->legacyPublicPath($objectKey));
    }

    public function delete(string $objectKey): void
    {
        foreach ([$this->absolute($objectKey), $this->legacyPublicPath($objectKey)] as $path) {
            if (is_file($path)) {
                @unlink($path);
            }
        }
    }

    public function copy(string $fromKey, string $toKey): void
    {
        $source = $this->absolute($fromKey);

        if (!is_file($source)) {
            $source = $this->legacyPublicPath($fromKey);
        }

        $target = $this->absolute($toKey);
        $dir = dirname($target);

        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        @copy($source, $target);
    }

    public function viewUrl(string $objectKey, int $ttlSeconds, string $mimeType): string
    {
        ObjectKeyBuilder::assertSafe($objectKey);

        return URL::temporarySignedRoute(
            'local-documents.view',
            now()->addSeconds(max(60, $ttlSeconds)),
            ['path' => $objectKey]
        );
    }

    public function downloadUrl(string $objectKey, int $ttlSeconds, string $downloadName): string
    {
        ObjectKeyBuilder::assertSafe($objectKey);

        return URL::temporarySignedRoute(
            'local-documents.view',
            now()->addSeconds(max(60, $ttlSeconds)),
            ['path' => $objectKey, 'download' => basename($downloadName) ?: 'document']
        );
    }

    public function healthy(): bool
    {
        $base = storage_path('app/private/uploads');

        return is_dir($base) || @mkdir($base, 0755, true);
    }
}
