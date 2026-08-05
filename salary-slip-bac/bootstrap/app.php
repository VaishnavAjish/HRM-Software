<?php

use App\Http\Middleware\JwtMiddleware;
use App\Http\Middleware\RequireModuleSchema;
use App\Http\Middleware\RequirePermission;
use App\Http\Middleware\RequireRoleManager;
use App\Http\Middleware\RequireSuperAdmin;
use App\Http\Middleware\RoleMiddleware;
use App\Http\Middleware\SecurityHeaders;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // HandleCors is already in Laravel's default global middleware stack, so
        // it was appended here for nothing. Harmless (append() de-duplicates via
        // array_unique) but misleading: it read like CORS was switched on here
        // rather than in config/cors.php.
        $middleware->alias([
            'jwt.auth' => JwtMiddleware::class,
            'role' => RoleMiddleware::class,
            'permission' => RequirePermission::class,
            'module.schema' => RequireModuleSchema::class,
            'super.admin' => RequireSuperAdmin::class,
            'role.manager' => RequireRoleManager::class,
        ]);

        // Global security headers on every response
        $middleware->append(SecurityHeaders::class);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->shouldRenderJsonWhen(function (Request $request, Throwable $e) {
            if ($request->is('api/*') || $request->is('api')) {
                return true;
            }

            return $request->expectsJson();
        });
    })->create();
