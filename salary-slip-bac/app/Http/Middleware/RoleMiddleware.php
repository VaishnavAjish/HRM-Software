<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class RoleMiddleware
{
    /**
     * Gate a route to one or more roles, e.g. ->middleware('role:admin,agent').
     * Must run after 'jwt.auth'. Mirrors the role normalization the frontend
     * does in AuthContext.getUserRole() so both sides agree on admin/agent/employee.
     */
    public function handle(Request $request, Closure $next, ...$roles)
    {
        $user = auth('api')->user();

        if (!$user) {
            return response()->json(['status' => false, 'message' => 'Unauthenticated'], 401);
        }

        if (!in_array($this->resolveRole($user), $roles, true)) {
            return response()->json(['status' => false, 'message' => 'Forbidden: insufficient permissions'], 403);
        }

        return $next($request);
    }

    private function resolveRole($user): string
    {
        if ($user->type === 'agent' || (int) $user->role === 4) {
            return 'agent';
        }
        if (in_array((int) $user->role, [0, 1, 2], true) || strtolower((string) $user->role) === 'admin') {
            return 'admin';
        }
        return 'employee';
    }
}
