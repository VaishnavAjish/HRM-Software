<?php

namespace App\Http\Middleware;

use App\Support\RoleAudit;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The single gate for role management.
 *
 * Role mutation is deliberately NOT authorised by permission. Every other
 * surface in this application asks "does the caller hold admin.role.update?",
 * and that is the right question everywhere except here: the thing being edited
 * IS the permission system. A caller who can grant themselves
 * admin.role.update can then grant themselves everything else, so a permission
 * check on this surface authorises its own escalation.
 *
 * So this middleware asks a different question — is the caller the protected
 * super administrator? — and that answer cannot be granted by editing a role.
 * It holds even if some other role is accidentally given the role-management
 * permissions in the database, which the brief requires explicitly.
 *
 * Identity comes from User::isSuperAdmin(): the numeric role 0 or the
 * is_super_admin column. Never the role's display name, which is editable text.
 */
class RequireSuperAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $actor = auth('api')->user();

        if ($actor && $actor->isSuperAdmin()) {
            return $next($request);
        }

        RoleAudit::denied($request, $actor, 'SUPER_ADMIN_REQUIRED');

        // 403 with a body, never 200-with-an-error. The message says what is
        // required and nothing about how the check is implemented, which role
        // codes exist, or what the caller would need to hold.
        return response()->json([
            'success' => false,
            'code' => 'SUPER_ADMIN_REQUIRED',
            'message' => 'Only the Super Admin can manage roles and permissions.',
        ], 403);
    }
}
