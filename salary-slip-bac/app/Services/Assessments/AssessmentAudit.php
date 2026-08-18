<?php

namespace App\Services\Assessments;

use App\Models\AssessmentAuditLog;
use App\Models\QuizAttempt;
use Illuminate\Support\Facades\Request as RequestFacade;

/**
 * Assessment assignment/invitation/revocation audit trail. Mirrors
 * DocumentAudit's shape and discipline deliberately, rather than inventing a
 * second convention: recordSafely() for read-path/best-effort events so a
 * broken audit table can't take a working screen down with it, record() left
 * able to throw for anything that must fail closed.
 *
 * Never records the raw access_token or the assembled candidate URL — only
 * identifiers and safe context.
 */
class AssessmentAudit
{
    public const ASSIGNED = 'ASSESSMENT_ASSIGNED';
    public const EMAIL_PREVIEWED = 'ASSESSMENT_EMAIL_PREVIEWED';
    public const INVITATION_QUEUED = 'ASSESSMENT_INVITATION_QUEUED';
    public const INVITATION_SENT = 'ASSESSMENT_INVITATION_SENT';
    public const INVITATION_FAILED = 'ASSESSMENT_INVITATION_FAILED';
    public const INVITATION_RESENT = 'ASSESSMENT_INVITATION_RESENT';
    public const REVOKED = 'ASSESSMENT_REVOKED';
    public const PERMISSION_DENIED = 'ASSESSMENT_PERMISSION_DENIED';

    public static function record(
        string $action,
        ?QuizAttempt $attempt = null,
        array $metadata = [],
    ): ?AssessmentAuditLog {
        $request = RequestFacade::instance();

        $ip = $request?->header('X-Forwarded-For')
            ? trim(explode(',', $request->header('X-Forwarded-For'))[0])
            : ($request?->header('X-Real-IP') ?? $request?->ip());

        return AssessmentAuditLog::create([
            'quiz_attempt_id' => $attempt?->id,
            'candidate_id' => $attempt?->candidate_id,
            'quiz_id' => $attempt?->quiz_id,
            'company_code' => $attempt?->company_code,
            'actor_user_id' => optional(auth('api')->user())->id,
            'action' => $action,
            'ip_address' => $ip,
            'user_agent' => substr((string) $request?->userAgent(), 0, 500),
            'request_id' => $request?->header('X-Request-Id'),
            'metadata' => self::scrub($metadata),
        ]);
    }

    public static function recordSafely(
        string $action,
        ?QuizAttempt $attempt = null,
        array $metadata = [],
    ): ?AssessmentAuditLog {
        try {
            return self::record($action, $attempt, $metadata);
        } catch (\Throwable $e) {
            report($e);

            return null;
        }
    }

    /** Strip anything that must never reach the audit table. */
    private static function scrub(array $metadata): array
    {
        foreach (['access_token', 'token', 'quiz_url', 'url', 'authorization', 'secret'] as $key) {
            unset($metadata[$key]);
        }

        return $metadata;
    }
}
