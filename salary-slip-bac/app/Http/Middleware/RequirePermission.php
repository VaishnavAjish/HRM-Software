<?php

namespace App\Http\Middleware;

use App\Services\Authorization\AuthorizationEngine;
use App\Services\Authorization\FeatureFlags;
use Closure;
use Illuminate\Http\Request;

class RequirePermission
{
    public function __construct(
        private readonly AuthorizationEngine $authorization,
        private readonly FeatureFlags $flags,
    ) {
    }

    public function handle(Request $request, Closure $next, string $permission)
    {
        $actor = auth('api')->user();
        if (!$actor) {
            return response()->json(['success' => false, 'error' => ['code' => 'AUTHENTICATION_REQUIRED', 'message' => 'Authentication required.']], 401);
        }

        $resource = [
            'resource_type' => $request->route()?->getName() ?: $request->path(),
            'id' => $request->route('id') ?? $request->route('userId') ?? $request->route('appointmentId'),
            'company_code' => $request->route('company') ?? $request->input('company_code') ?? $request->query('company_code'),
            'branch_id' => $request->input('branch_id') ?? $request->query('branch_id'),
            'department' => $request->input('department') ?? $request->query('department'),
        ];
        $decision = $this->authorization->decide($actor, $permission, $resource, [
            'action' => ['changed_fields' => array_keys($request->except(['password', 'token', 'access_token']))],
            'business_reason' => $request->input('businessReason'),
        ]);

        if (!$decision->allowed) {
            $shadow = $this->flags->enabled('authorization_shadow_mode', $actor->company_code, true);
            if (!($shadow && ($decision->legacyDecision['allowed'] ?? false))) {
                return response()->json([
                    'success' => false,
                    'error' => ['code' => 'PERMISSION_DENIED', 'message' => 'You are not permitted to perform this action.'],
                ], 403);
            }
            $request->attributes->set('authorization_shadow_mismatch', $decision->toArray());
        }

        $request->attributes->set('authorization_decision', $decision);
        return $next($request);
    }
}
