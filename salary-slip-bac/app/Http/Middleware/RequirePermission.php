<?php

namespace App\Http\Middleware;

use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\FeatureFlags;
use App\Services\Authorization\PermissionEnforcementPolicy;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class RequirePermission
{
    private static ?bool $authorizationSchemaReady = null;

    public function __construct(
        private readonly AuthorizationEngine $authorization,
        private readonly FeatureFlags $flags,
        private readonly PermissionEnforcementPolicy $enforcement,
    ) {
    }

    public function handle(Request $request, Closure $next, string ...$permissions)
    {
        $actor = auth('api')->user();
        if (!$actor) {
            return response()->json(['success' => false, 'error' => ['code' => 'AUTHENTICATION_REQUIRED', 'message' => 'Authentication required.']], 401);
        }

        // Super administrators bypass the permission gate entirely — no schema
        // probe, no engine call, no lookup. This mirrors the engine's own
        // short-circuit so a route that never reaches the engine (e.g. blocked
        // by an unmigrated schema) still admits the root account.
        if ($actor->isSuperAdmin()) {
            $request->attributes->set('authorization_super_admin', true);
            return $next($request);
        }

        $resource = [
            'resource_type' => $request->route()?->getName() ?: $request->path(),
            'id' => $request->route('id') ?? $request->route('userId') ?? $request->route('appointmentId'),
            'company_code' => $request->route('company') ?? $request->input('company_code') ?? $request->query('company_code'),
            'branch_id' => $request->input('branch_id') ?? $request->query('branch_id'),
            'department' => $request->input('department') ?? $request->query('department'),
        ];

        // Deployments can briefly run the new application code before the
        // additive authorization migration reaches the database. Querying the
        // new role/policy columns in that window turns every protected business
        // endpoint into a 500. Keep the pre-existing authorization contract for
        // business routes until the schema is complete; never expose the new
        // administration surface without its backing schema.
        if (!$this->schemaReady()) {
            foreach ($permissions as $permission) {
                if (!str_starts_with($permission, 'admin.') && $this->authorization->legacyAllows($actor, $permission, $resource)) {
                    $request->attributes->set('authorization_compatibility_mode', true);
                    return $next($request);
                }
            }

            foreach ($permissions as $permission) {
                if (str_starts_with($permission, 'admin.')) {
                    return response()->json([
                        'success' => false,
                        'error' => [
                            'code' => 'AUTHORIZATION_SCHEMA_NOT_READY',
                            'message' => 'Authorization services are being upgraded. Please retry shortly.',
                        ],
                    ], 503);
                }
            }

            return response()->json([
                'success' => false,
                'error' => ['code' => 'PERMISSION_DENIED', 'message' => 'You are not permitted to perform this action.'],
            ], 403);
        }

        $denied = [];

        foreach ($permissions as $permission) {
            $decision = $this->authorization->decide($actor, $permission, $resource, [
                'action' => ['changed_fields' => array_keys($request->except(['password', 'token', 'access_token']))],
                'business_reason' => $request->input('businessReason'),
            ]);

            if ($decision->allowed) {
                $request->attributes->set('authorization_decision', $decision);
                return $next($request);
            }

            $denied[$permission] = $decision;
        }

        foreach ($denied as $permission => $decision) {
            if (!($decision->legacyDecision['allowed'] ?? false)) {
                continue;
            }

            if ($this->enforcement->isEnforced($permission, $request->route()?->getName(), $actor->company_code)) {
                continue;
            }

            if (!$this->flags->enabled('authorization_shadow_mode', $actor->company_code, true)) {
                continue;
            }

            Log::channel(config('logging.default'))->info('authorization.shadow_would_deny', [
                'permission' => $permission,
                'route' => $request->route()?->getName() ?: $request->path(),
                'actor_id' => $actor->id,
                'tenant' => $actor->company_code,
                'would_deny' => true,
                'request_id' => $request->header('X-Request-Id'),
            ]);

            $request->attributes->set('authorization_shadow_mismatch', $decision->toArray());
            $request->attributes->set('authorization_decision', $decision);
            return $next($request);
        }

        return response()->json([
            'success' => false,
            'error' => ['code' => 'PERMISSION_DENIED', 'message' => 'You are not permitted to perform this action.'],
        ], 403);
    }

    private function schemaReady(): bool
    {
        return self::$authorizationSchemaReady ??= Schema::hasTable('authorization_feature_flags')
            && Schema::hasTable('authorization_role_assignments')
            && Schema::hasTable('authorization_policies')
            && Schema::hasColumn('permissions', 'code')
            && Schema::hasColumn('permissions', 'is_active')
            && Schema::hasColumn('roles', 'code')
            && Schema::hasColumn('roles', 'status')
            && Schema::hasColumn('role_permissions', 'effect')
            && Schema::hasColumn('user_permissions', 'valid_until');
    }
}
