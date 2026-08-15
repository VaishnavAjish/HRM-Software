<?php

namespace App\Http\Controllers\Api\V1\Authorization;

use App\Http\Controllers\Controller;
use App\Models\UserDevice;
use App\Services\Authorization\DeviceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class DeviceController extends Controller
{
    public function __construct(
        private readonly DeviceService $deviceService
    ) {}

    /**
     * Get all devices for the authenticated user.
     */
    public function index(Request $request)
    {
        $user = $request->user();
        $devices = $this->deviceService->getUserDevices($user);

        return response()->json([
            'status' => true,
            'data' => $devices->map(fn($d) => [
                'id' => $d->id,
                'device_id' => $d->device_id,
                'device_name' => $d->device_name,
                'browser' => $d->browser,
                'os' => $d->os,
                'device_type' => $d->device_type,
                'is_trusted' => $d->is_trusted,
                'is_blocked' => $d->is_blocked,
                'first_seen_at' => $d->first_seen_at?->toISOString(),
                'last_seen_at' => $d->last_seen_at?->toISOString(),
                'trusted_at' => $d->trusted_at?->toISOString(),
                'blocked_at' => $d->blocked_at?->toISOString(),
                'block_reason' => $d->block_reason,
                'login_count' => $d->login_count,
            ]),
        ]);
    }

    /**
     * Get trusted devices.
     */
    public function trusted(Request $request)
    {
        $user = $request->user();
        $devices = $this->deviceService->getTrustedDevices($user);

        return response()->json([
            'status' => true,
            'data' => $devices->map(fn($d) => [
                'id' => $d->id,
                'device_id' => $d->device_id,
                'device_name' => $d->device_name,
                'browser' => $d->browser,
                'os' => $d->os,
                'device_type' => $d->device_type,
                'trusted_at' => $d->trusted_at?->toISOString(),
                'last_seen_at' => $d->last_seen_at?->toISOString(),
                'login_count' => $d->login_count,
            ]),
        ]);
    }

    /**
     * Get blocked devices.
     */
    public function blocked(Request $request)
    {
        $user = $request->user();
        $devices = $this->deviceService->getBlockedDevices($user);

        return response()->json([
            'status' => true,
            'data' => $devices->map(fn($d) => [
                'id' => $d->id,
                'device_id' => $d->device_id,
                'device_name' => $d->device_name,
                'browser' => $d->browser,
                'os' => $d->os,
                'device_type' => $d->device_type,
                'blocked_at' => $d->blocked_at?->toISOString(),
                'block_reason' => $d->block_reason,
            ]),
        ]);
    }

    /**
     * Trust a device.
     */
    public function trust(Request $request, string $deviceId)
    {
        $user = $request->user();

        $trusted = $this->deviceService->trustDevice($user, $deviceId, $user);

        if (!$trusted) {
            return response()->json(['status' => false, 'message' => 'Device not found'], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'Device marked as trusted',
        ]);
    }

    /**
     * Block a device.
     */
    public function block(Request $request, string $deviceId)
    {
        $validator = Validator::make($request->all(), [
            'reason' => 'nullable|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = $request->user();
        $reason = $request->input('reason', 'user_blocked');

        $blocked = $this->deviceService->blockDevice($user, $deviceId, $user, $reason);

        if (!$blocked) {
            return response()->json(['status' => false, 'message' => 'Device not found'], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'Device blocked successfully',
        ]);
    }

    /**
     * Unblock a device.
     */
    public function unblock(Request $request, string $deviceId)
    {
        $user = $request->user();

        $unblocked = $this->deviceService->unblockDevice($user, $deviceId);

        if (!$unblocked) {
            return response()->json(['status' => false, 'message' => 'Device not found'], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'Device unblocked successfully',
        ]);
    }

    /**
     * Rename a device.
     */
    public function rename(Request $request, string $deviceId)
    {
        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:100',
        ]);

        if ($validator->fails()) {
            return response()->json(['status' => false, 'message' => $validator->errors()->first()], 422);
        }

        $user = $request->user();
        $name = $request->input('name');

        $renamed = $this->deviceService->renameDevice($user, $deviceId, $name);

        if (!$renamed) {
            return response()->json(['status' => false, 'message' => 'Device not found'], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'Device renamed successfully',
        ]);
    }

    /**
     * Remove a device (only if not blocked).
     */
    public function remove(Request $request, string $deviceId)
    {
        $user = $request->user();

        $removed = $this->deviceService->removeDevice($user, $deviceId);

        if (!$removed) {
            return response()->json(['status' => false, 'message' => 'Device not found or cannot be removed'], 404);
        }

        return response()->json([
            'status' => true,
            'message' => 'Device removed successfully',
        ]);
    }

    /**
     * Get device statistics.
     */
    public function stats(Request $request)
    {
        $user = $request->user();
        $stats = $this->deviceService->getDeviceStats($user);

        return response()->json([
            'status' => true,
            'data' => $stats,
        ]);
    }
}