<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

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
            'jwt.auth' => \App\Http\Middleware\JwtMiddleware::class,
            'role' => \App\Http\Middleware\RoleMiddleware::class,
            'permission' => \App\Http\Middleware\RequirePermission::class,
            'module.schema' => \App\Http\Middleware\RequireModuleSchema::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $exceptions->shouldRenderJsonWhen(function (\Illuminate\Http\Request $request, \Throwable $e) {
            if ($request->is('api/*') || $request->is('api')) {
                return true;
            }
            return $request->expectsJson();
        });
    })->create();
