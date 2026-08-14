<?php

namespace App\Support;

use App\Models\OrganizationActivityLog;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/**
 * Immutable activity records for the Organization domain (02.01, 02.09).
 *
 * The schema tables (enterprises, change requests, ...) carry their own audit
 * trail. This helper centralises the write so every DOMAIN 02 service records
 * history in one shape. It degrades to a no-op if the activity table is not
 * present (a deployment stopped before the last migration).
 */
class OrganizationActivityLogSupport
{
    public static function log(
        User $actor,
        string $activityType,
        string $subjectType,
        ?int $subjectId,
        ?array $before = null,
        ?array $after = null,
        ?string $description = null,
        ?int $enterpriseId = null,
        ?int $companyId = null
    ): void {
        if (! Schema::hasTable('organization_activity_logs')) {
            return;
        }

        $request = request();

        OrganizationActivityLog::create([
            'enterprise_id' => $enterpriseId,
            'company_id' => $companyId,
            'activity_type' => $activityType,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'actor_id' => $actor->id,
            'before_values' => $before,
            'after_values' => $after,
            'description' => $description,
            'ip_address' => $request ? ($request->header('X-Forwarded-For')
                ? trim(explode(',', $request->header('X-Forwarded-For'))[0])
                : ($request->header('X-Real-IP') ?? $request->ip())) : null,
            'user_agent' => $request ? $request->userAgent() : null,
        ]);
    }
}
