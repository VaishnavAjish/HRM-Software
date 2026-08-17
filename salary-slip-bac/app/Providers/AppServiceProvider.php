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
            return Limit::perMinute((int) env('API_RATE_LIMIT', 10000))
                ->by($request->user()?->id ?: $request->ip());
        });

        RateLimiter::for('public-jobs', function (Request $request) {
            return Limit::perMinute(10000)->by('public-jobs:'.$request->ip());
        });

        // Resend-verification is a self-service mailer trigger — without a
        // per-email cap a caller could email-bomb any candidate's inbox by
        // posting the same address repeatedly from rotating IPs, so the
        // email-keyed limits apply regardless of source IP.
        RateLimiter::for('candidate-resend', function (Request $request) {
            $email = strtolower(trim((string) $request->input('email')));

            return [
                Limit::perMinute(1)->by('candidate-resend-email:'.$email),
                Limit::perDay(5)->by('candidate-resend-email:'.$email),
                Limit::perMinute(10)->by('candidate-resend-ip:'.$request->ip()),
            ];
        });

        // Candidate login rate limiter: High IP burst ceiling to support heavy traffic/NATs/load testing
        // combined with a per-email failed attempt limit to prevent account brute-force attacks.
        RateLimiter::for('candidate-login', function (Request $request) {
            $email = strtolower(trim((string) $request->input('email')));

            return [
                Limit::perMinute((int) env('CANDIDATE_LOGIN_IP_LIMIT', 10000))->by('candidate-login-ip:'.$request->ip()),
                Limit::perMinute(10)->by('candidate-login-email:'.$email),
            ];
        });

        RateLimiter::for('candidate-register', function (Request $request) {
            return [
                Limit::perMinute(100)->by('candidate-register-ip:'.$request->ip()),
            ];
        });

        RateLimiter::for('candidate-forgot', function (Request $request) {
            $email = strtolower(trim((string) $request->input('email')));

            return [
                Limit::perMinute(3)->by('candidate-forgot-email:'.$email),
                Limit::perMinute(20)->by('candidate-forgot-ip:'.$request->ip()),
            ];
        });
    }
}
