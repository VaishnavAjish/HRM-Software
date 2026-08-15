<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\UserSession;
use App\Services\Authorization\SessionService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class SessionController extends Controller
{
    public function __construct(
        private readonly SessionService $sessionService
    ) {}

    /**
     * Get all sessions for the authenticated user.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $sessions = $this->sessionService->getUserSessions($user);

        return response()->json([
            'status' => true,
            'data' => $sessions->map(fn($s) => [
                'id' => $s->id,
                'session_id' => $s->session_id,
                'device_name' => $s->device_name,
                'browser' => $s->browser,
                'os' => $s->os,
                'ip_address' => $s->ip_address,
                'location' => $s->location,
                'auth_method' => $s->auth_method,
                'mfa_verified' => $s->mfa_verified,
                'is_current' => $s->is_current,
                'is_trusted' => $s->is_trusted,
                'last_activity_at' => $s->last_activity_at?->toISOString(),
                'expires_at' => $s->expires_at?->toISOString(),
                'revoked_at' => $s->revoked_at?->toISOString(),
                'revoke_reason' => $s->revoke_reason,
                'idle_time_seconds' => $s->getIdleTime(),
                'time_remaining_seconds' => $s->getTimeRemaining(),
            ]),
        ]);
    }

    /**
     * Get current session info.
     */
    public function current(Request $request)
    {
        $user = $request->user();
        $session = $this->sessionService->getCurrentSession($user);

        if (!$session) {
            return response()->json([
                'status' => false,
                'message' => 'No active session found',
            ], 404);
        }

        return response()->json([
            'status' => true,
            'data' => [
                'id' => $session->id,
                'session_id' => $session->session_id,
                'device_name' => $session->device_name,
                'browser' => $session->browser,
                'os' => $session->os,
                'ip_address' => $session->ip_address,
                'location' => $session->location,
                'auth_method' => $session->auth_method,
                'mfa_verified' => $session->mfa_verified,
                'is_current' => $session->is_current,
                'is_trusted' => $session->is_trusted,
                'last_activity_at' => $session->last_activity_at?->toISOString(),
                'expires_at' => $session->expires_at?->toISOString(),
                'idle_time_seconds' => $session->getIdleTime(),
                'time_remaining_seconds' => $session->getTimeRemaining(),
            ],
        ]);
    }

    /**
     * Revoke a specific session.
     */
    public function revoke(Request $request, int $sessionId)
    {
        $user = $request->user();

        $revoked = $this->sessionService->revokeSession($user, $sessionId, $user, 'user_revoked');

        if (!$revoked) {
            return response()->json(['status' => false, 'message' => 'Session not found'], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'Session revoked successfully',
        ]);
    }

    /**
     * Revoke all other sessions (keep current).
     */
    public function revokeAllOthers(Request $request)
    {
        $user = $request->user();
        $currentSessionId = $request->bearerToken();

        $count = $this->sessionService->revokeAllOtherSessions($user, $currentSessionId, $user);

        return response()->json([
            'status' => true,
            'message' => "{$count} other session(s) revoked successfully",
        ]);
    }

    /**
     * Revoke all sessions (including current).
     */
    public function revokeAll(Request $request)
    {
        $user = $request->user();

        $count = $this->sessionService->revokeAllSessions($user, $user, 'user_revoked_all');

        return response()->json([
            'status' => true,
            'message' => "All {$count} session(s) revoked successfully",
        ]);
    }

    /**
     * Trust a device.
     */
    public function trustDevice(Request $request, int $sessionId)
    {
        $user = $request->user();

        $trusted = $this->sessionService->trustDevice($user, $sessionId);

        if (!$trusted) {
            return response()->json(['status' => false, 'message' => 'Session not found'], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'Device marked as trusted',
        ]);
    }

    /**
     * Block a device (revoke all sessions from that device).
     */
    public function blockDevice(Request $request, int $sessionId)
    {
        $user = $request->user();

        $session = UserSession::where('user_id', $user->id)
            ->where('id', $sessionId)
            ->first();

        if (!$session) {
            return response()->json(['status' => false, 'message' => 'Session not found'], 404);
        }

        $count = $this->sessionService->blockDevice($user, $session->device_id, $user);

        return response()->json([
            'status' => true,
            'message' => "Device blocked. {$count} session(s) revoked.",
        ]);
    }

    /**
     * Get session statistics.
     */
    public function stats(Request $request)
    {
        $user = $request->user();
        $stats = $this->sessionService->getSessionStats($user);

        return response()->json([
            'status' => true,
            'data' => $stats,
        ]);
    }
}