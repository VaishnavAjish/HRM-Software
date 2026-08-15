<?php

namespace App\Services\Authorization;

use App\Models\User;
use App\Models\UserDevice;
use App\Models\UserSession;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Device Service — Domain 01.11 Device Management.
 *
 * Centralized service for device management including registration,
 * trust, blocking, and history tracking.
 */
class DeviceService
{
    /**
     * Register or update a device from a session.
     */
    public function registerFromSession(UserSession $session): UserDevice
    {
        $device = UserDevice::firstOrCreate(
            [
                'user_id' => $session->user_id,
                'device_id' => $session->device_id,
            ],
            [
                'device_name' => $session->device_name,
                'browser' => $session->browser,
                'os' => $session->os,
                'device_type' => $this->detectDeviceType($session->user_agent ?? ''),
                'first_seen_at' => now(),
                'last_seen_at' => now(),
                'login_count' => 1,
            ]
        );

        // Update existing device
        if ($device->wasRecentlyCreated === false) {
            $device->recordLogin();
        }

        return $device;
    }

    /**
     * Get all devices for a user.
     */
    public function getUserDevices(User $user): \Illuminate\Database\Eloquent\Collection
    {
        return UserDevice::where('user_id', $user->id)
            ->orderBy('is_trusted', 'desc')
            ->orderBy('is_blocked', 'asc')
            ->orderBy('last_seen_at', 'desc')
            ->get();
    }

    /**
     * Get trusted devices for a user.
     */
    public function getTrustedDevices(User $user): \Illuminate\Database\Eloquent\Collection
    {
        return UserDevice::where('user_id', $user->id)
            ->trusted()
            ->orderBy('last_seen_at', 'desc')
            ->get();
    }

    /**
     * Get blocked devices for a user.
     */
    public function getBlockedDevices(User $user): \Illuminate\Database\Eloquent\Collection
    {
        return UserDevice::where('user_id', $user->id)
            ->blocked()
            ->orderBy('blocked_at', 'desc')
            ->get();
    }

    /**
     * Trust a device.
     */
    public function trustDevice(User $user, string $deviceId, ?User $trustedBy = null): bool
    {
        $device = UserDevice::where('user_id', $user->id)
            ->where('device_id', $deviceId)
            ->first();

        if (!$device) {
            return false;
        }

        $device->trust($trustedBy);
        return true;
    }

    /**
     * Block a device.
     */
    public function blockDevice(User $user, string $deviceId, ?User $blockedBy = null, string $reason = 'user_blocked'): bool
    {
        $device = UserDevice::where('user_id', $user->id)
            ->where('device_id', $deviceId)
            ->first();

        if (!$device) {
            return false;
        }

        $device->block($blockedBy, $reason);

        // Also revoke all active sessions from this device
        UserSession::where('user_id', $user->id)
            ->where('device_id', $deviceId)
            ->where('revoked_at', null)
            ->update([
                'revoked_at' => now(),
                'revoked_by' => $blockedBy?->id,
                'revoke_reason' => 'device_blocked',
                'is_current' => false,
            ]);

        return true;
    }

    /**
     * Unblock a device.
     */
    public function unblockDevice(User $user, string $deviceId): bool
    {
        $device = UserDevice::where('user_id', $user->id)
            ->where('device_id', $deviceId)
            ->first();

        if (!$device) {
            return false;
        }

        $device->unblock();
        return true;
    }

    /**
     * Rename a device.
     */
    public function renameDevice(User $user, string $deviceId, string $name): bool
    {
        $device = UserDevice::where('user_id', $user->id)
            ->where('device_id', $deviceId)
            ->first();

        if (!$device) {
            return false;
        }

        $device->device_name = $name;
        $device->save();

        return true;
    }

    /**
     * Remove a device (only if not blocked).
     */
    public function removeDevice(User $user, string $deviceId): bool
    {
        $device = UserDevice::where('user_id', $user->id)
            ->where('device_id', $deviceId)
            ->where('is_blocked', false)
            ->first();

        if (!$device) {
            return false;
        }

        $device->delete();
        return true;
    }

    /**
     * Check if a device is trusted.
     */
    public function isTrusted(User $user, string $deviceId): bool
    {
        $device = UserDevice::where('user_id', $user->id)
            ->where('device_id', $deviceId)
            ->first();

        return $device?->isTrusted() ?? false;
    }

    /**
     * Check if a device is blocked.
     */
    public function isBlocked(User $user, string $deviceId): bool
    {
        $device = UserDevice::where('user_id', $user->id)
            ->where('device_id', $deviceId)
            ->first();

        return $device?->isBlocked() ?? false;
    }

    /**
     * Get device by ID.
     */
    public function getDevice(User $user, string $deviceId): ?UserDevice
    {
        return UserDevice::where('user_id', $user->id)
            ->where('device_id', $deviceId)
            ->first();
    }

    /**
     * Get device statistics.
     */
    public function getDeviceStats(User $user): array
    {
        $devices = $this->getUserDevices($user);

        return [
            'total' => $devices->count(),
            'trusted' => $devices->where('is_trusted', true)->count(),
            'blocked' => $devices->where('is_blocked', true)->count(),
            'active' => $devices->where('is_blocked', false)->count(),
        ];
    }

    /**
     * Detect device type from user agent.
     */
    private function detectDeviceType(string $userAgent): string
    {
        $userAgent = strtolower($userAgent);

        if (str_contains($userAgent, 'mobile') || str_contains($userAgent, 'android') || str_contains($userAgent, 'iphone')) {
            return 'mobile';
        }

        if (str_contains($userAgent, 'tablet') || str_contains($userAgent, 'ipad')) {
            return 'tablet';
        }

        return 'desktop';
    }

    /**
     * Clean up old devices (no activity for 1 year).
     */
    public function cleanupOldDevices(): int
    {
        return UserDevice::where('last_seen_at', '<', now()->subYear())
            ->where('is_trusted', false)
            ->where('is_blocked', false)
            ->delete();
    }
}