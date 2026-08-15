<?php

namespace App\Services\Authorization;

use App\Models\User;
use App\Models\UserSession;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Session Service — Domain 01.10 Session Management.
 *
 * Centralized service for session management including creation, tracking,
 * revocation, and concurrent session limits.
 */
class SessionService
{
    public const DEFAULT_SESSION_TTL_MINUTES = 60 * 24 * 30; // 30 days
    public const DEFAULT_IDLE_TIMEOUT_MINUTES = 60; // 1 hour
    public const MAX_CONCURRENT_SESSIONS = 5;

    /**
     * Create a new session for a user.
     */
    public function createSession(
        User $user,
        string $sessionId,
        array $deviceInfo = [],
        string $authMethod = 'password',
        bool $mfaVerified = false
    ): UserSession {
        // Enforce concurrent session limit
        $this->enforceConcurrentLimit($user);

        // Parse device info
        $deviceId = $deviceInfo['device_id'] ?? $this->generateDeviceId($deviceInfo);
        $deviceName = $deviceInfo['device_name'] ?? $this->generateDeviceName($deviceInfo);
        $browser = $deviceInfo['browser'] ?? null;
        $os = $deviceInfo['os'] ?? null;
        $ipAddress = $deviceInfo['ip'] ?? null;
        $location = $deviceInfo['location'] ?? null;
        $userAgent = $deviceInfo['user_agent'] ?? null;

        // Mark existing sessions as non-current
        UserSession::where('user_id', $user->id)
            ->where('is_current', true)
            ->update(['is_current' => false]);

        return UserSession::create([
            'user_id' => $user->id,
            'session_id' => $sessionId,
            'device_id' => $deviceId,
            'device_name' => $deviceName,
            'browser' => $browser,
            'os' => $os,
            'ip_address' => $ipAddress,
            'location' => $location,
            'user_agent' => $userAgent,
            'auth_method' => $authMethod,
            'mfa_verified' => $mfaVerified,
            'is_current' => true,
            'is_trusted' => false,
            'last_activity_at' => now(),
            'expires_at' => now()->addMinutes(self::DEFAULT_SESSION_TTL_MINUTES),
        ]);
    }

    /**
     * Update session activity timestamp.
     */
    public function updateActivity(string $sessionId): bool
    {
        return UserSession::where('session_id', $sessionId)
            ->where('is_current', true)
            ->where('revoked_at', null)
            ->update(['last_activity_at' => now()]) > 0;
    }

    /**
     * Get all active sessions for a user.
     */
    public function getUserSessions(User $user): \Illuminate\Database\Eloquent\Collection
    {
        return UserSession::where('user_id', $user->id)
            ->orderBy('is_current', 'desc')
            ->orderBy('last_activity_at', 'desc')
            ->get();
    }

    /**
     * Get the current session for a user.
     */
    public function getCurrentSession(User $user): ?UserSession
    {
        return UserSession::where('user_id', $user->id)
            ->where('is_current', true)
            ->where('revoked_at', null)
            ->where('expires_at', '>', now())
            ->first();
    }

    /**
     * Revoke a specific session.
     */
    public function revokeSession(User $user, int $sessionId, ?User $revokedBy = null, string $reason = 'user_revoked'): bool
    {
        $session = UserSession::where('user_id', $user->id)
            ->where('id', $sessionId)
            ->first();

        if (!$session) {
            return false;
        }

        $session->revoked_at = now();
        $session->revoked_by = $revokedBy?->id;
        $session->revoke_reason = $reason;
        $session->is_current = false;
        $session->save();

        return true;
    }

    /**
     * Revoke all sessions for a user except the current one.
     */
    public function revokeAllOtherSessions(User $user, string $currentSessionId, ?User $revokedBy = null): int
    {
        return UserSession::where('user_id', $user->id)
            ->where('session_id', '!=', $currentSessionId)
            ->where('is_current', true)
            ->where('revoked_at', null)
            ->update([
                'revoked_at' => now(),
                'revoked_by' => $revokedBy?->id,
                'revoke_reason' => 'revoke_all_other',
                'is_current' => false,
            ]);
    }

    /**
     * Revoke all sessions for a user.
     */
    public function revokeAllSessions(User $user, ?User $revokedBy = null, string $reason = 'revoke_all'): int
    {
        return UserSession::where('user_id', $user->id)
            ->where('revoked_at', null)
            ->update([
                'revoked_at' => now(),
                'revoked_by' => $revokedBy?->id,
                'revoke_reason' => $reason,
                'is_current' => false,
            ]);
    }

    /**
     * Mark a session as trusted device.
     */
    public function trustDevice(User $user, int $sessionId): bool
    {
        $session = UserSession::where('user_id', $user->id)
            ->where('id', $sessionId)
            ->first();

        if (!$session) {
            return false;
        }

        $session->is_trusted = true;
        $session->save();

        return true;
    }

    /**
     * Block a device (revoke all sessions from that device).
     */
    public function blockDevice(User $user, string $deviceId, ?User $revokedBy = null): int
    {
        return UserSession::where('user_id', $user->id)
            ->where('device_id', $deviceId)
            ->where('revoked_at', null)
            ->update([
                'revoked_at' => now(),
                'revoked_by' => $revokedBy?->id,
                'revoke_reason' => 'device_blocked',
                'is_current' => false,
            ]);
    }

    /**
     * Clean up expired sessions.
     */
    public function cleanupExpiredSessions(): int
    {
        return UserSession::where('expires_at', '<', now())
            ->where('revoked_at', null)
            ->update([
                'revoked_at' => now(),
                'revoke_reason' => 'expired',
                'is_current' => false,
            ]);
    }

    /**
     * Clean up old revoked sessions (older than 90 days).
     */
    public function cleanupOldRevokedSessions(): int
    {
        return UserSession::where('revoked_at', '<', now()->subDays(90))
            ->delete();
    }

    /**
     * Check if a session is valid.
     */
    public function isSessionValid(string $sessionId): bool
    {
        $session = UserSession::where('session_id', $sessionId)
            ->where('is_current', true)
            ->where('revoked_at', null)
            ->where('expires_at', '>', now())
            ->first();

        return $session !== null;
    }

    /**
     * Get session by ID.
     */
    public function getSessionById(string $sessionId): ?UserSession
    {
        return UserSession::where('session_id', $sessionId)->first();
    }

    /**
     * Enforce concurrent session limit.
     */
    private function enforceConcurrentLimit(User $user): void
    {
        $activeCount = UserSession::where('user_id', $user->id)
            ->where('is_current', true)
            ->where('revoked_at', null)
            ->where('expires_at', '>', now())
            ->count();

        if ($activeCount >= self::MAX_CONCURRENT_SESSIONS) {
            // Revoke the oldest session
            UserSession::where('user_id', $user->id)
                ->where('is_current', true)
                ->where('revoked_at', null)
                ->where('expires_at', '>', now())
                ->oldest('last_activity_at')
                ->limit($activeCount - self::MAX_CONCURRENT_SESSIONS + 1)
                ->update([
                    'revoked_at' => now(),
                    'revoke_reason' => 'concurrent_limit_exceeded',
                    'is_current' => false,
                ]);
        }
    }

    /**
     * Generate a device ID from device info.
     */
    private function generateDeviceId(array $deviceInfo): string
    {
        $components = [
            $deviceInfo['browser'] ?? '',
            $deviceInfo['os'] ?? '',
            $deviceInfo['ip'] ?? '',
        ];

        return Str::substr(Hash::make(implode('|', $components)), 0, 32);
    }

    /**
     * Generate a user-friendly device name.
     */
    private function generateDeviceName(array $deviceInfo): string
    {
        $browser = $deviceInfo['browser'] ?? 'Unknown Browser';
        $os = $deviceInfo['os'] ?? 'Unknown OS';

        return "{$browser} on {$os}";
    }

    /**
     * Get session statistics for a user.
     */
    public function getSessionStats(User $user): array
    {
        $sessions = $this->getUserSessions($user);

        return [
            'total' => $sessions->count(),
            'active' => $sessions->where('is_current', true)->where('revoked_at', null)->count(),
            'trusted' => $sessions->where('is_trusted', true)->count(),
            'current_device' => $sessions->where('is_current', true)->first()?->device_name,
        ];
    }
}