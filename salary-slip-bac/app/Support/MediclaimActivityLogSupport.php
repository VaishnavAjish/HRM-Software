<?php

namespace App\Support;

use App\Models\Mediclaim\MediclaimAdminActivityLog;
use App\Models\User;
use Illuminate\Support\Facades\Schema;

/**
 * Immutable activity records for non-claim Mediclaim admin actions (hospital,
 * policy, rule-book, reviewer-assignment edits, card verify attempts).
 * Claim-specific history lives in `mediclaim_claim_events`, written via
 * MediclaimClaimEventLog, instead.
 *
 * Exact clone of OrganizationActivityLogSupport::log(), including its
 * `Schema::hasTable()` no-op guard. Unlike MediclaimClaimEventLog (which
 * drops the guard because its table is a hard RequireModuleSchema
 * dependency for every Mediclaim route), the screens this class serves —
 * hospital/policy/rule-book/reviewer admin, and the public card-verify
 * endpoint which sits *outside* `jwt.auth` and is deliberately excluded from
 * `module.schema:mediclaim` per the routing plan — can plausibly run before
 * the full module schema has landed, so degrading to a no-op rather than a
 * 500 matters here the same way it does for Organization.
 */
class MediclaimActivityLogSupport
{
    public static function log(
        ?User $actor,
        string $activityType,
        string $subjectType,
        ?int $subjectId,
        ?array $before = null,
        ?array $after = null,
        ?string $description = null,
        ?string $companyCode = null
    ): void {
        if (! Schema::hasTable('mediclaim_admin_activity_logs')) {
            return;
        }

        $request = request();

        MediclaimAdminActivityLog::create([
            'company_code' => $companyCode,
            'activity_type' => $activityType,
            'subject_type' => $subjectType,
            'subject_id' => $subjectId,
            'actor_id' => $actor?->id,
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
