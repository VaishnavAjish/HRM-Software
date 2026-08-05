<?php

namespace App\Http\Middleware;

use App\Support\RoleAudit;
use App\Support\RoleHierarchy;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The coarse gate on the role-management surface.
 *
 * This answers only "may this caller manage ANY role?" — super administrator or
 * administrator. It deliberately does NOT decide whether the specific target is
 * manageable; that is per-target and lives in RoleHierarchy::canManage(), called
 * by the controller once the target has been loaded. Splitting it this way keeps
 * the middleware from having to resolve a route model, and keeps the real
 * decision in one place rather than duplicated across ten routes.
 *
 * Authorisation is by rank, not by permission. A custom role handed
 * admin.role.create in the database still lands here as CUSTOM and is refused,
 * which is the escalation the brief requires blocking.
 */
class RequireRoleManager
{
    public function handle(Request $request, Closure $next): Response
    {
        $actor = auth('api')->user();

        if ($actor && RoleHierarchy::canAccessRoleManagement($actor)) {
            return $next($request);
        }

        RoleAudit::denied($request, $actor, 'ROLE_MANAGEMENT_FORBIDDEN');

        // 403 with a body, never 200-with-an-error. The message says nothing
        // about which tier would be required, what the caller holds, or that a
        // hierarchy exists at all.
        return response()->json([
            'success' => false,
            'code' => 'ROLE_MANAGEMENT_FORBIDDEN',
            'message' => 'You do not have permission to manage this role.',
        ], 403);
    }
}
