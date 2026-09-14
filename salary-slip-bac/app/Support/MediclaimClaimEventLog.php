<?php

namespace App\Support;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimEvent;
use App\Models\User;

/**
 * Append-only workflow timeline writer for the Mediclaim claim workflow.
 *
 * Clone of OrganizationActivityLogSupport::log(), scoped to claims and
 * returning the created row so a future notifier (B7) can atomically claim it
 * via `notified_at`.
 *
 * Unlike OrganizationActivityLogSupport, this deliberately does NOT guard with
 * `Schema::hasTable()`. `mediclaim_claim_events` is one of the tables
 * `RequireModuleSchema` requires before any `module.schema:mediclaim`-gated
 * route is reachable at all (see MODULES['mediclaim'] in
 * app/Http/Middleware/RequireModuleSchema.php), so by the time
 * ClaimWorkflowService runs — always behind that middleware once B4 wires
 * routes — the table is guaranteed to exist. The Organization guard exists
 * for a different, narrower reason (that module predates strict
 * module-schema gating for its own tables), which does not apply here.
 */
class MediclaimClaimEventLog
{
    public static function record(
        MediclaimClaim $claim,
        string $eventType,
        ?string $from,
        ?string $to,
        ?User $actor,
        ?string $description = null,
        ?array $before = null,
        ?array $after = null,
        ?string $actorRole = null
    ): MediclaimClaimEvent {
        $request = request();

        return MediclaimClaimEvent::create([
            'claim_id' => $claim->id,
            'event_type' => $eventType,
            'from_status' => $from,
            'to_status' => $to,
            'actor_id' => $actor?->id,
            'actor_role' => $actorRole,
            'before_values' => $before,
            'after_values' => $after,
            'description' => $description,
            'ip_address' => $request ? self::resolveIp($request) : null,
            'user_agent' => $request ? $request->userAgent() : null,
        ]);
    }

    private static function resolveIp($request): ?string
    {
        return $request->header('X-Forwarded-For')
            ? trim(explode(',', $request->header('X-Forwarded-For'))[0])
            : ($request->header('X-Real-IP') ?? $request->ip());
    }
}
