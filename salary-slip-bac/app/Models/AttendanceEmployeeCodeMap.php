<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * attendance_employee_code_map — one employee, potentially several
 * per-device biometric codes (spec §23). Consulted by AttendancePunchIngestor
 * BEFORE the legacy emp_code/punching_no/form_no fallback.
 */
class AttendanceEmployeeCodeMap extends Model
{
    protected $table = 'attendance_employee_code_map';

    protected $fillable = ['user_id', 'device_id', 'device_user_code', 'is_active'];

    protected function casts(): array
    {
        return ['is_active' => 'boolean'];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function device()
    {
        return $this->belongsTo(AttendanceDevice::class, 'device_id');
    }
}
