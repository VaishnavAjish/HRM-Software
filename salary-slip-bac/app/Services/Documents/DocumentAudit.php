<?php

namespace App\Services\Documents;

use App\Models\Document;
use App\Models\DocumentAuditLog;
use App\Models\DocumentVersion;
use Illuminate\Support\Facades\Request as RequestFacade;

/**
 * Dedicated document audit trail.
 *
 * Never records presigned URLs, tokens, credentials or file contents — only
 * identifiers and safe context.
 */
class DocumentAudit
{
    public const UPLOAD_STARTED       = 'UPLOAD_STARTED';
    public const UPLOAD_COMPLETED     = 'UPLOAD_COMPLETED';
    public const UPLOAD_FAILED        = 'UPLOAD_FAILED';
    public const VIEW_URL_GENERATED   = 'VIEW_URL_GENERATED';
    public const DOWNLOAD_URL_GENERATED = 'DOWNLOAD_URL_GENERATED';
    public const DOCUMENT_REPLACED    = 'DOCUMENT_REPLACED';
    public const DOCUMENT_DELETED     = 'DOCUMENT_DELETED';
    public const DOCUMENT_RESTORED    = 'DOCUMENT_RESTORED';
    public const DOCUMENT_ARCHIVED    = 'DOCUMENT_ARCHIVED';
    public const PERMANENTLY_DELETED  = 'DOCUMENT_PERMANENTLY_DELETED';
    public const VERSION_VIEWED       = 'VERSION_VIEWED';
    public const PERMISSION_DENIED    = 'PERMISSION_DENIED';
    public const MALWARE_DETECTED     = 'MALWARE_DETECTED';
    public const S3_OPERATION_FAILED  = 'S3_OPERATION_FAILED';
    public const LEGACY_MIGRATED      = 'LEGACY_MIGRATED';

    /**
     * Returns the created entry so a caller that must not proceed without an
     * audit trail can check it and roll back. Existing callers ignore it.
     */
    public static function record(
        string $action,
        ?Document $document = null,
        ?DocumentVersion $version = null,
        array $metadata = [],
        ?string $permission = null,
        ?string $permissionResult = null
    ): ?DocumentAuditLog {
        $request = RequestFacade::instance();

        $ip = $request?->header('X-Forwarded-For')
            ? trim(explode(',', $request->header('X-Forwarded-For'))[0])
            : ($request?->header('X-Real-IP') ?? $request?->ip());

        return DocumentAuditLog::create([
            'document_id'         => $document?->id,
            'document_version_id' => $version?->id,
            'organization_code'   => $document?->organization_code,
            'actor_user_id'       => optional(auth('api')->user())->id,
            'action'              => $action,
            'permission'          => $permission,
            'permission_result'   => $permissionResult,
            'ip_address'          => $ip,
            'user_agent'          => substr((string) $request?->userAgent(), 0, 500),
            'request_id'          => $request?->header('X-Request-Id'),
            'correlation_id'      => $request?->header('X-Correlation-Id'),
            'metadata'            => self::scrub($metadata),
        ]);
    }

    /**
     * Record without letting a logging failure break the caller.
     *
     * For a read — showing a details page, listing appointments — an audit entry
     * that cannot be written must not take the screen down with it. record() is
     * deliberately left able to throw, because the confidential-export path has
     * to fail closed when it cannot be recorded; the two needs are opposite and
     * this is the read-side half.
     *
     * The failure is reported so it surfaces in monitoring rather than vanishing:
     * an audit table that has stopped accepting writes is a real problem, just not
     * one whose correct response is a blank page.
     */
    public static function recordSafely(
        string $action,
        ?Document $document = null,
        ?DocumentVersion $version = null,
        array $metadata = [],
        ?string $permission = null,
        ?string $permissionResult = null
    ): ?DocumentAuditLog {
        try {
            return self::record($action, $document, $version, $metadata, $permission, $permissionResult);
        } catch (\Throwable $e) {
            report($e);

            return null;
        }
    }

    public static function denied(string $permission, ?Document $document = null, array $metadata = []): void
    {
        // A denial is itself a read-path event — refusing access must not turn
        // into a 500 because the refusal could not be logged.
        self::recordSafely(self::PERMISSION_DENIED, $document, null, $metadata, $permission, 'DENIED');
    }

    /** Strip anything that must never reach the audit table. */
    private static function scrub(array $metadata): array
    {
        foreach (['url', 'view_url', 'download_url', 'presigned_url', 'token', 'authorization', 'secret'] as $key) {
            unset($metadata[$key]);
        }

        return $metadata;
    }
}
