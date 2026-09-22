<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * attendance_devices — the eSSL machine registry (Attendance Engine spec
 * §24, §62). Seeded from `EsslBiometricService::DEVICE_SERIALS` by
 * migration `2026_09_22_000001_create_attendance_devices_table`.
 */
class AttendanceDevice extends Model
{
    public const STATUSES = ['online', 'offline', 'unknown'];

    protected $fillable = [
        'serial_number', 'name', 'ip_address', 'company_code', 'unit', 'location',
        'status', 'is_active', 'last_sync_at', 'last_successful_sync_at',
        'last_sync_error', 'last_sync_punch_count',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'last_sync_at' => 'datetime',
            'last_successful_sync_at' => 'datetime',
        ];
    }

    public function punches()
    {
        return $this->hasMany(AttendancePunch::class, 'device_id');
    }
}
