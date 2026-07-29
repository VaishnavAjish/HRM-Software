<?php

namespace App\Exceptions;

use RuntimeException;
use Throwable;

/**
 * Application-level document error carrying a stable machine code.
 *
 * Messages here are safe to show a client; AWS/database internals are mapped
 * onto these codes rather than surfaced.
 */
class DocumentException extends RuntimeException
{
    public const AUTHENTICATION_REQUIRED  = 'AUTHENTICATION_REQUIRED';
    public const ACCESS_DENIED            = 'ACCESS_DENIED';
    public const NOT_FOUND                = 'DOCUMENT_NOT_FOUND';
    public const TYPE_INVALID             = 'DOCUMENT_TYPE_INVALID';
    public const FILE_TYPE_NOT_ALLOWED    = 'DOCUMENT_FILE_TYPE_NOT_ALLOWED';
    public const FILE_TOO_LARGE           = 'DOCUMENT_FILE_TOO_LARGE';
    public const FILE_EMPTY               = 'DOCUMENT_FILE_EMPTY';
    public const FILE_CORRUPTED           = 'DOCUMENT_FILE_CORRUPTED';
    public const MIME_MISMATCH            = 'DOCUMENT_MIME_MISMATCH';
    public const ALREADY_DELETED          = 'DOCUMENT_ALREADY_DELETED';
    public const VERSION_CONFLICT         = 'DOCUMENT_VERSION_CONFLICT';
    public const DUPLICATE_UPLOAD         = 'DOCUMENT_DUPLICATE_UPLOAD';
    public const PENDING_SCAN             = 'DOCUMENT_PENDING_SCAN';
    public const QUARANTINED              = 'DOCUMENT_QUARANTINED';
    public const UPLOAD_FAILED            = 'DOCUMENT_UPLOAD_FAILED';
    public const S3_ACCESS_DENIED         = 'S3_ACCESS_DENIED';
    public const S3_BUCKET_NOT_FOUND      = 'S3_BUCKET_NOT_FOUND';
    public const S3_UNAVAILABLE           = 'S3_UNAVAILABLE';
    public const S3_TIMEOUT               = 'S3_TIMEOUT';
    public const S3_RATE_LIMITED          = 'S3_RATE_LIMITED';
    public const CONFIGURATION_INVALID    = 'DOCUMENT_CONFIGURATION_INVALID';
    public const IDEMPOTENCY_CONFLICT     = 'IDEMPOTENCY_CONFLICT';

    public function __construct(
        public readonly string $errorCode,
        string $message,
        public readonly int $status = 422,
        ?Throwable $previous = null
    ) {
        parent::__construct($message, 0, $previous);
    }

    public static function accessDenied(string $message = 'You do not have permission to perform this action.'): self
    {
        return new self(self::ACCESS_DENIED, $message, 403);
    }

    public static function notFound(string $message = 'Document not found.'): self
    {
        return new self(self::NOT_FOUND, $message, 404);
    }

    /**
     * Map an AWS SDK failure onto a safe application code — the raw exception
     * leaks bucket names, ARNs and request internals.
     */
    public static function fromAws(Throwable $e): self
    {
        $awsCode = method_exists($e, 'getAwsErrorCode') ? (string) $e->getAwsErrorCode() : '';

        return match ($awsCode) {
            'AccessDenied', 'AllAccessDisabled', 'InvalidAccessKeyId', 'SignatureDoesNotMatch'
                => new self(self::S3_ACCESS_DENIED, 'Storage access was denied.', 502, $e),
            'NoSuchBucket'
                => new self(self::S3_BUCKET_NOT_FOUND, 'Storage bucket is not available.', 502, $e),
            'RequestTimeout', 'RequestTimeTooSkewed'
                => new self(self::S3_TIMEOUT, 'Storage request timed out.', 504, $e),
            'SlowDown', 'TooManyRequests'
                => new self(self::S3_RATE_LIMITED, 'Storage is rate limiting requests. Please retry.', 503, $e),
            default
                => new self(self::S3_UNAVAILABLE, 'Storage is temporarily unavailable.', 502, $e),
        };
    }

    public function toArray(?string $requestId = null): array
    {
        return [
            'success' => false,
            'error'   => [
                'code'    => $this->errorCode,
                'message' => $this->getMessage(),
                'details' => null,
            ],
            'meta' => ['requestId' => $requestId],
        ];
    }
}
