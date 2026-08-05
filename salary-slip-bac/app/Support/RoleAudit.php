<?php

namespace App\Support;

use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Audit trail for role management.
 *
 * Writes through the existing audit_logs table rather than a new one, so role
 * events land in the same trail administrators already read.
 *
 * Denials are recorded as well as successes. An audit that only shows what
 * happened cannot answer "did anyone try?", which is the question asked after
 * an incident.
 *
 * Never records tokens, passwords, session identifiers or permission
 * definitions — only which permission codes moved, and in which direction.
 */
class RoleAudit
{
    public const CREATED = 'ROLE_CREATED';
    public const UPDATED = 'ROLE_UPDATED';
    public const CLONED = 'ROLE_CLONED';
    public const PERMISSIONS_UPDATED = 'ROLE_PERMISSIONS_UPDATED';
    public const ACTIVATED = 'ROLE_ACTIVATED';
    public const DEACTIVATED = 'ROLE_DEACTIVATED';
    public const ARCHIVED = 'ROLE_ARCHIVED';
    public const RESTORED = 'ROLE_RESTORED';
    public const DELETED = 'ROLE_DELETED';
    public const DENIED = 'ROLE_ACTION_DENIED';

    public static function record(
        ?Request $request,
        ?User $actor,
        string $operation,
        ?Role $role = null,
        ?array $before = null,
        ?array $after = null
    ): void {
        try {
            DB::table('audit_logs')->insert([
                'user_id' => $actor?->id,
                'action' => $operation,
                'module' => 'Roles',
                'old_value' => $before ? json_encode(self::scrub($before)) : null,
                'new_value' => json_encode(self::scrub(array_filter([
                    'roleId' => $role?->id,
                    'roleCode' => $role?->code,
                    'tenantId' => $role?->tenant_id,
                    'actorRoleCode' => $actor?->getAttribute('role_code'),
                    'outcome' => 'SUCCESS',
                ] + ($after ?? []), static fn ($v) => $v !== null)),),
                'ip_address' => $request ? self::ip($request) : null,
                'user_agent' => $request ? substr((string) $request->userAgent(), 0, 500) : null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (Throwable $e) {
            // An audit write must never take down the operation it describes,
            // but it must not vanish either — report so it surfaces in the log.
            report($e);
        }
    }

    public static function denied(?Request $request, ?User $actor, string $reason, ?Role $role = null): void
    {
        try {
            DB::table('audit_logs')->insert([
                'user_id' => $actor?->id,
                'action' => self::DENIED,
                'module' => 'Roles',
                'old_value' => null,
                'new_value' => json_encode(array_filter([
                    'reason' => $reason,
                    'method' => $request?->method(),
                    'path' => $request?->path(),
                    'roleId' => $role?->id,
                    'roleCode' => $role?->code,
                    'outcome' => 'DENIED',
                ], static fn ($v) => $v !== null)),
                'ip_address' => $request ? self::ip($request) : null,
                'user_agent' => $request ? substr((string) $request->userAgent(), 0, 500) : null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        } catch (Throwable $e) {
            report($e);
        }
    }

    private static function ip(Request $request): string
    {
        $forwarded = $request->header('X-Forwarded-For');

        return substr(
            $forwarded ? trim(explode(',', $forwarded)[0]) : (string) $request->ip(),
            0,
            45
        );
    }

    /** Drop anything that should never reach an audit row. */
    private static function scrub(array $values): array
    {
        unset(
            $values['password'],
            $values['token'],
            $values['remember_token'],
            $values['api_token'],
            $values['secret'],
        );

        return $values;
    }
}
