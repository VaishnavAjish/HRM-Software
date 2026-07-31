<?php

namespace App\Support;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Log;
use Throwable;
use Tymon\JWTAuth\Facades\JWTAuth;
use Tymon\JWTAuth\Token;

/**
 * Server-side session lifecycle for the API's JWT authentication.
 *
 * This application authenticates with a stateless JWT carried in the
 * Authorization header — there are no authentication cookies, no server-side
 * session rows and no refresh endpoint. "Revoking a session" therefore means one
 * thing: putting the token on the blacklist so it stops being accepted before it
 * would otherwise expire.
 *
 * That matters more here than it would with a short-lived token: JWT_TTL is 30
 * days, so a token that fails to be revoked at logout stays usable for up to a
 * month on whatever machine still holds it.
 *
 * Centralised so logout, and anything else that needs to end a session, cannot
 * drift apart in how thoroughly they revoke.
 */
class AuthSession
{
    /**
     * Revoke a token, whatever state it is in.
     *
     * Returns true when the token is definitely no longer usable — either it was
     * blacklisted here, or it was already unusable (expired, malformed, absent,
     * already blacklisted). Returns false only when revocation was genuinely
     * attempted and genuinely failed, which the caller should log but must not
     * turn into a failed logout: refusing to end a session because the store is
     * unavailable leaves the user logged in, which is the opposite of what they
     * asked for.
     *
     * Never returns, logs or throws anything containing the token itself.
     */
    public static function revokeCurrentToken(): bool
    {
        $raw = self::rawToken();

        if ($raw === null) {
            // Nothing presented. Logout is still a success — there is no session
            // left to end.
            return true;
        }

        $token = new Token($raw);

        try {
            JWTAuth::manager()->invalidate($token);

            return true;
        } catch (Throwable $e) {
            return self::revokeUnvalidatable($token, $e);
        }
    }

    /**
     * Second attempt for a token the normal path could not decode.
     *
     * The ordinary invalidate() builds a payload with full validation, so an
     * expired token throws before it can be blacklisted. The refresh flow is the
     * mechanism the library itself uses to read an expired token, so it is
     * reused here to blacklist one.
     *
     * An expired token is already refused by every authenticated route, so
     * failing here is not a security hole — it is belt and braces for the case
     * where the clock, the TTL or the blacklist grace period disagree.
     */
    private static function revokeUnvalidatable(Token $token, Throwable $original): bool
    {
        try {
            JWTAuth::manager()->setRefreshFlow(true)->invalidate($token, true);

            return true;
        } catch (Throwable $e) {
            // Both attempts failed. Record why, without the token, so a broken
            // blacklist store is visible in monitoring rather than silent.
            Log::warning('auth.logout.revocation_failed', [
                'first_error' => class_basename($original),
                'second_error' => class_basename($e),
            ]);

            return false;
        } finally {
            // The manager is resolved from the container as a singleton, so the
            // refresh flag would otherwise leak into the next request handled by
            // this worker and let it decode expired tokens.
            JWTAuth::manager()->setRefreshFlow(false);
        }
    }

    /**
     * The bearer token exactly as presented, without validating it.
     *
     * JWTAuth::getToken() throws when no token is present, which is a normal
     * situation for a logout that arrives without credentials.
     */
    private static function rawToken(): ?string
    {
        try {
            $token = JWTAuth::getToken();
        } catch (Throwable) {
            return null;
        }

        $raw = $token ? (string) $token->get() : '';

        return $raw !== '' ? $raw : null;
    }

    /**
     * Mark a response as never cacheable.
     *
     * Authentication responses carry identity and credentials; a shared cache,
     * reverse proxy or CDN holding one and replaying it to the next user is a
     * cross-user leak. Applied to every auth response rather than only the
     * obvious ones.
     */
    public static function noStore(JsonResponse $response): JsonResponse
    {
        return $response
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate, private')
            ->header('Pragma', 'no-cache')
            ->header('Expires', '0');
    }
}
