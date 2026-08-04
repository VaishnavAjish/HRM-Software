<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

class SecurityHeaders
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        // Content Security Policy - restrictive, allows self + approved domains
        $csp = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Vite/React needs inline/eval in dev
            "style-src 'self' 'unsafe-inline'", // Tailwind + inline styles
            "img-src 'self' data: blob: https:", // Images from self, data URLs, blob, HTTPS
            "font-src 'self' data: https:", // Fonts
            "connect-src 'self' https: wss:", // API + WebSocket (for Vite HMR)
            "frame-src 'self'", // Iframes from self only
            "object-src 'none'", // No plugins
            "base-uri 'self'", // Base tag only from self
            "form-action 'self'", // Forms only to self
            "frame-ancestors 'none'", // No framing
            'upgrade-insecure-requests', // Upgrade HTTP to HTTPS
        ];

        // Add CSP header
        $response->headers->set('Content-Security-Policy', implode('; ', $csp));

        // Other security headers
        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        $response->headers->set('X-Permitted-Cross-Domain-Policies', 'none');

        // HSTS - only in production with HTTPS
        if (app()->environment('production') && $request->isSecure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
        }

        // Remove server header
        $response->headers->remove('Server');
        $response->headers->remove('X-Powered-By');

        return $response;
    }
}
