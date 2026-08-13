<?php

namespace App\Http\Middleware;

use Closure;
use Exception;
use Illuminate\Http\Request;
use Tymon\JWTAuth\Facades\JWTAuth;
use Tymon\JWTAuth\Http\Middleware\BaseMiddleware;

class JwtMiddleware extends BaseMiddleware
{
    public function handle(Request $request, Closure $next)
    {
        try {
            $user = JWTAuth::parseToken()->authenticate();
        } catch (Exception $e) {
            if ($e instanceof \Tymon\JWTAuth\Exceptions\TokenInvalidException) {
                return response()->json(['status' => false, 'message' => 'Token is Invalid'], 401);
            } elseif ($e instanceof \Tymon\JWTAuth\Exceptions\TokenExpiredException) {
                return response()->json(['status' => false, 'message' => 'Token is Expired'], 401);
            } else {
                return response()->json(['status' => false, 'message' => 'Authorization Token not found'], 401);
            }
        }

        // A password change/reset stamps password_changed_at; every token
        // issued before that moment (iat in seconds) is dead, so a stolen
        // 30-day token cannot outlive a password rotation.
        if ($user && $user->password_changed_at) {
            $issuedAt = (int) JWTAuth::getPayload()->get('iat');
            if ($issuedAt > 0 && $issuedAt < $user->password_changed_at->getTimestamp()) {
                return response()->json(['status' => false, 'message' => 'Token is Invalid'], 401);
            }
        }

        return $next($request);
    }
}
