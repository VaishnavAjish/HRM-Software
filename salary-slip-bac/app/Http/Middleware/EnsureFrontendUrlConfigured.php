<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

/**
 * Guards routes whose entire job is emailing a frontend link (e.g. resend
 * verification). Unlike register()/forgotPassword(), which create real state
 * and can recover later via resend, these routes have nothing useful to do
 * without a valid FRONTEND_URL — so they fail loudly instead of returning a
 * fake "sent" response while silently doing nothing.
 */
class EnsureFrontendUrlConfigured
{
    public function handle(Request $request, Closure $next)
    {
        $frontendUrl = (string) config('services.frontend_url');
        $parsed = parse_url($frontendUrl);
        $valid = $frontendUrl !== ''
            && filter_var($frontendUrl, FILTER_VALIDATE_URL) !== false
            && in_array($parsed['scheme'] ?? '', ['http', 'https'], true)
            && ! empty($parsed['host'] ?? '');

        if (! $valid) {
            Log::critical('career_portal_frontend_url_misconfigured', ['path' => $request->path()]);

            return response()->json([
                'status' => false,
                'message' => 'This feature is temporarily unavailable. Please try again later.',
            ], 503);
        }

        return $next($request);
    }
}
