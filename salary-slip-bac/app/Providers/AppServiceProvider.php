<?php

namespace App\Providers;

use App\Http\Middleware\JwtMiddleware;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(Router $router): void
    {
        // Re-assert the jwt.auth alias AFTER tymon/jwt-auth's service provider
        // boots. tymon's LaravelServiceProvider aliases jwt.auth to its own
        // Authenticate middleware, which silently overrode the alias set in
        // bootstrap/app.php — so the custom JwtMiddleware (which revokes tokens
        // issued before a password change) never ran. This provider boots after
        // package providers, so this binding wins and the revocation check is
        // actually enforced on every protected route.
        $router->aliasMiddleware('jwt.auth', JwtMiddleware::class);

        RateLimiter::for('api', function (Request $request) {
            return Limit::perMinute((int) env('API_RATE_LIMIT', 120))
                ->by($request->user()?->id ?: $request->ip());
        });
    }
}
