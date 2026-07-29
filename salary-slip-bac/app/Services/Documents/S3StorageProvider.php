<?php

namespace App\Services\Documents;

use App\Exceptions\DocumentException;
use App\Support\ObjectKeyBuilder;
use Aws\S3\S3Client;
use Aws\S3\MultipartUploader;
use Aws\Exception\AwsException;
use Throwable;

/**
 * S3-backed document storage.
 *
 * Objects are always private: no ACLs are sent (the bucket is expected to be
 * Bucket Owner Enforced) and access is only ever granted through short-lived
 * presigned URLs generated after the caller has been authorised.
 */
class S3StorageProvider implements StorageProvider
{
    private S3Client $client;
    private string $bucket;

    public function __construct(?S3Client $client = null)
    {
        $config = config('documents.s3');

        if (empty($config['bucket'])) {
            throw new DocumentException(
                DocumentException::CONFIGURATION_INVALID,
                'AWS_S3_BUCKET is not configured.',
                500
            );
        }

        $this->bucket = $config['bucket'];

        // No credentials block: the SDK's default provider chain resolves the
        // EC2/ECS/EKS role in production and falls back to env keys locally.
        $this->client = $client ?? new S3Client(array_filter([
            'version'                 => 'latest',
            'region'                  => $config['region'] ?: 'us-east-1',
            'endpoint'                => $config['endpoint'] ?: null,
            'use_path_style_endpoint' => (bool) $config['path_style'],
            'retries'                 => 3,
            // TLS verification stays on; this only tells cURL where the trust
            // store is when the host has not configured one.
            'http'                    => ($ca = $config['ca_bundle'] ?? null) ? ['verify' => $ca] : null,
        ], fn ($v) => $v !== null));
    }

    /** SSE headers for every write, per configured policy. */
    private function encryptionParams(): array
    {
        $encryption = config('documents.s3.encryption', 'AES256');

        if ($encryption === 'aws:kms') {
            return array_filter([
                'ServerSideEncryption' => 'aws:kms',
                'SSEKMSKeyId'          => config('documents.s3.kms_key_id') ?: null,
            ]);
        }

        return ['ServerSideEncryption' => 'AES256'];
    }

    public function put(string $sourcePath, string $objectKey, string $mimeType): array
    {
        ObjectKeyBuilder::assertSafe($objectKey);

        $size = @filesize($sourcePath) ?: 0;
        $threshold = (int) config('documents.s3.multipart_threshold');

        $params = array_merge([
            'Bucket'       => $this->bucket,
            'Key'          => $objectKey,
            'ContentType'  => $mimeType,
            'StorageClass' => config('documents.s3.storage_class', 'STANDARD'),
        ], $this->encryptionParams());

        try {
            if ($size >= $threshold) {
                // Streams the file in parts; aborts (and cleans up) on failure
                // so no orphaned parts accumulate and bill.
                $uploader = new MultipartUploader($this->client, $sourcePath, [
                    'bucket'          => $this->bucket,
                    'key'             => $objectKey,
                    'part_size'       => (int) config('documents.s3.part_size'),
                    'concurrency'     => (int) config('documents.s3.concurrency'),
                    'before_initiate' => function ($command) use ($params) {
                        foreach ($params as $k => $v) {
                            $command[$k] = $v;
                        }
                    },
                ]);

                try {
                    $result = $uploader->upload();
                } catch (Throwable $e) {
                    $this->abortMultipart($objectKey);
                    throw $e;
                }
            } else {
                $stream = @fopen($sourcePath, 'rb');

                if ($stream === false) {
                    throw new DocumentException(
                        DocumentException::FILE_CORRUPTED,
                        'The file could not be read for upload.'
                    );
                }

                try {
                    $result = $this->client->putObject($params + ['Body' => $stream]);
                } finally {
                    if (is_resource($stream)) {
                        fclose($stream);
                    }
                }
            }
        } catch (AwsException $e) {
            throw DocumentException::fromAws($e);
        }

        return [
            'etag'          => trim((string) ($result['ETag'] ?? ''), '"') ?: null,
            'version_id'    => $result['VersionId'] ?? null,
            'storage_class' => config('documents.s3.storage_class', 'STANDARD'),
            'encryption'    => $result['ServerSideEncryption'] ?? config('documents.s3.encryption'),
            'kms_key_id'    => $result['SSEKMSKeyId'] ?? config('documents.s3.kms_key_id'),
        ];
    }

    private function abortMultipart(string $objectKey): void
    {
        try {
            $uploads = $this->client->listMultipartUploads([
                'Bucket' => $this->bucket,
                'Prefix' => $objectKey,
            ]);

            foreach ($uploads['Uploads'] ?? [] as $upload) {
                $this->client->abortMultipartUpload([
                    'Bucket'   => $this->bucket,
                    'Key'      => $upload['Key'],
                    'UploadId' => $upload['UploadId'],
                ]);
            }
        } catch (Throwable) {
            // Best effort — the bucket lifecycle rule is the safety net.
        }
    }

    public function exists(string $objectKey): bool
    {
        try {
            return $this->client->doesObjectExist($this->bucket, $objectKey);
        } catch (AwsException) {
            return false;
        }
    }

    public function delete(string $objectKey): void
    {
        try {
            $this->client->deleteObject(['Bucket' => $this->bucket, 'Key' => $objectKey]);
        } catch (AwsException $e) {
            throw DocumentException::fromAws($e);
        }
    }

    public function copy(string $fromKey, string $toKey): void
    {
        ObjectKeyBuilder::assertSafe($toKey);

        try {
            $this->client->copyObject(array_merge([
                'Bucket'     => $this->bucket,
                'Key'        => $toKey,
                'CopySource' => $this->bucket . '/' . rawurlencode($fromKey),
            ], $this->encryptionParams()));
        } catch (AwsException $e) {
            throw DocumentException::fromAws($e);
        }
    }

    public function viewUrl(string $objectKey, int $ttlSeconds, string $mimeType): string
    {
        return $this->presign($objectKey, $ttlSeconds, [
            'ResponseContentDisposition' => 'inline',
            'ResponseContentType'        => $mimeType,
        ]);
    }

    public function downloadUrl(string $objectKey, int $ttlSeconds, string $downloadName): string
    {
        return $this->presign($objectKey, $ttlSeconds, [
            'ResponseContentDisposition' => 'attachment; filename="' . $downloadName . '"',
        ]);
    }

    private function presign(string $objectKey, int $ttlSeconds, array $overrides): string
    {
        ObjectKeyBuilder::assertSafe($objectKey);

        try {
            $command = $this->client->getCommand('GetObject', array_merge([
                'Bucket' => $this->bucket,
                'Key'    => $objectKey,
            ], $overrides));

            return (string) $this->client
                ->createPresignedRequest($command, "+{$ttlSeconds} seconds")
                ->getUri();
        } catch (AwsException $e) {
            throw DocumentException::fromAws($e);
        }
    }

    /** HeadBucket — no object is written just to answer a health check. */
    public function healthy(): bool
    {
        try {
            $this->client->headBucket(['Bucket' => $this->bucket]);

            return true;
        } catch (Throwable) {
            return false;
        }
    }
}
