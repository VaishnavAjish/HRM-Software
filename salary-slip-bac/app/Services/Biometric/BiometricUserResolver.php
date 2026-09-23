<?php

namespace App\Services\Biometric;

use App\Models\AttendanceEmployeeCodeMap;
use App\Models\AttendanceDevice;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * Unified employee-resolution logic for biometric device IDs.
 *
 * Every place in the codebase that needs to turn a raw device-reported
 * code (e.g. "10044") into a `User` model should go through this class.
 * Resolution chain (first match wins):
 *
 *   1. attendance_employee_code_map (device-specific override)
 *   2. attendance_employee_code_map (any-device / device_id NULL)
 *   3. users.emp_code       (exact, then zero-trimmed)
 *   4. users.punching_no    (exact, then zero-trimmed)
 *   5. users.form_no        (exact, then zero-trimmed)
 *   6. users.id             (numeric codes only)
 *
 * This replaces the duplicated matching logic previously scattered across
 * EsslBiometricService, AttendanceController, and AttendancePunchIngestor.
 */
class BiometricUserResolver
{
    /**
     * Device-specific code map: "deviceId|code" => User
     * @var array<string, User>
     */
    private array $deviceSpecificMap = [];

    /**
     * Any-device code map: "code" => User
     * @var array<string, User>
     */
    private array $anyDeviceMap = [];

    /**
     * Legacy fallback lookup: emp_code / punching_no / form_no / id => User
     * @var array<string, User>
     */
    private array $userLookup = [];

    /**
     * Device serial => device_id mapping
     * @var array<string, int>
     */
    private array $deviceIdBySerial = [];

    /** Whether code-map tables exist (migrations may not have run). */
    private bool $codeMapAvailable = true;

    /**
     * Build the resolver. Call once per request/sync cycle, then call
     * resolve() for each raw device code.
     *
     * @param  array  $empCodes  Raw employee codes from biometric devices
     */
    public function __construct(array $empCodes = [])
    {
        $this->loadCodeMap();
        $this->loadUsers($empCodes);
        $this->loadDeviceMap();
    }

    /**
     * Load device-specific and any-device code mappings from the
     * attendance_employee_code_map table. Guarded — a missing table
     * degrades to "no code-map entries" rather than crashing.
     */
    private function loadCodeMap(): void
    {
        try {
            // Device-specific overrides
            $deviceRows = AttendanceEmployeeCodeMap::query()
                ->where('is_active', true)
                ->whereNotNull('device_id')
                ->get(['device_id', 'device_user_code', 'user_id']);

            // Any-device mappings (device_id NULL)
            $anyRows = AttendanceEmployeeCodeMap::query()
                ->where('is_active', true)
                ->whereNull('device_id')
                ->get(['device_user_code', 'user_id']);

            // Preload users referenced by either set of mappings
            $userIds = $deviceRows->pluck('user_id')
                ->merge($anyRows->pluck('user_id'))
                ->unique()
                ->all();

            $usersById = ! empty($userIds)
                ? User::whereIn('id', $userIds)->get()->keyBy('id')
                : collect();

            foreach ($deviceRows as $row) {
                $user = $usersById[$row->user_id] ?? null;
                if ($user) {
                    $this->deviceSpecificMap["{$row->device_id}|{$row->device_user_code}"] = $user;
                }
            }

            foreach ($anyRows as $row) {
                $user = $usersById[$row->user_id] ?? null;
                if ($user) {
                    $this->anyDeviceMap[$row->device_user_code] = $user;
                }
            }
        } catch (\Throwable $e) {
            Log::warning('BiometricUserResolver: attendance_employee_code_map lookup failed (migrations not run yet?): ' . $e->getMessage());
            $this->codeMapAvailable = false;
        }
    }

    /**
     * Load device serial => ID mapping.
     */
    private function loadDeviceMap(): void
    {
        try {
            $this->deviceIdBySerial = AttendanceDevice::pluck('id', 'serial_number')->all();
        } catch (\Throwable $e) {
            Log::warning('BiometricUserResolver: attendance_devices lookup failed: ' . $e->getMessage());
            $this->deviceIdBySerial = [];
        }
    }

    /**
     * Preload users by emp_code, punching_no, form_no, and id — the legacy
     * fallback chain. This is the same logic that was in
     * EsslBiometricService::syncAttendance() lines 441-479.
     */
    private function loadUsers(array $empCodes): void
    {
        if (empty($empCodes)) {
            return;
        }

        $numericCodes = array_values(array_filter($empCodes, fn($c) => is_numeric($c)));
        $trimmedCodes = array_values(array_unique(array_filter(
            array_map(fn($c) => ltrim((string) $c, '0'), $empCodes)
        )));

        $users = User::where('is_deleted', 0)
            ->where(function ($q) use ($empCodes, $numericCodes, $trimmedCodes) {
                $q->whereIn('emp_code', $empCodes)
                  ->orWhereIn('punching_no', $empCodes)
                  ->orWhereIn('form_no', $empCodes);
                if (! empty($numericCodes)) {
                    $q->orWhereIn('id', $numericCodes);
                }
                if (! empty($trimmedCodes)) {
                    $q->orWhereIn('emp_code', $trimmedCodes)
                      ->orWhereIn('punching_no', $trimmedCodes)
                      ->orWhereIn('form_no', $trimmedCodes);
                }
            })
            ->get();

        foreach ($users as $u) {
            $keys = [
                (string) $u->emp_code,
                ltrim((string) $u->emp_code, '0'),
                (string) $u->punching_no,
                ltrim((string) $u->punching_no, '0'),
                (string) $u->form_no,
                ltrim((string) $u->form_no, '0'),
                (string) $u->id,
            ];
            foreach ($keys as $k) {
                if ($k !== '') {
                    $this->userLookup[$k] = $u;
                }
            }
        }
    }

    /**
     * Resolve a raw biometric device code to a User.
     *
     * @param  string       $code          Raw code from the device (e.g. "10044")
     * @param  string|null  $deviceSerial  Device serial number (for device-specific overrides)
     * @return User|null
     */
    public function resolve(string $code, ?string $deviceSerial = null): ?User
    {
        $trimmed = ltrim($code, '0');

        // Priority 1: Device-specific code map
        if ($deviceSerial && $this->codeMapAvailable) {
            $deviceId = $this->deviceIdBySerial[$deviceSerial] ?? null;
            if ($deviceId) {
                $user = $this->deviceSpecificMap["{$deviceId}|{$code}"] ?? null;
                if ($user) {
                    return $user;
                }
            }
        }

        // Priority 2: Any-device code map
        if ($this->codeMapAvailable) {
            $user = $this->anyDeviceMap[$code] ?? null;
            if ($user) {
                return $user;
            }
            // Also try trimmed version
            if ($trimmed !== '' && $trimmed !== $code) {
                $user = $this->anyDeviceMap[$trimmed] ?? null;
                if ($user) {
                    return $user;
                }
            }
        }

        // Priority 3: Legacy fallback — emp_code / punching_no / form_no / id
        return $this->userLookup[$code]
            ?? ($trimmed !== '' ? ($this->userLookup[$trimmed] ?? null) : null);
    }

    /**
     * Return the full user lookup map (for passing to AttendancePunchIngestor
     * which still expects the old-style array<string, User> format).
     *
     * @return array<string, User>
     */
    public function getUserLookup(): array
    {
        return $this->userLookup;
    }

    /**
     * Get device ID by serial number.
     */
    public function getDeviceId(string $serial): ?int
    {
        return $this->deviceIdBySerial[$serial] ?? null;
    }

    /**
     * Whether the attendance_employee_code_map table was reachable.
     */
    public function isCodeMapAvailable(): bool
    {
        return $this->codeMapAvailable;
    }
}
