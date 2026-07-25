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
        return $next($request);
    }
}
