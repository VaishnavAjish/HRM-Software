<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceRegularization extends Model
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'user_id', 'attendance_date', 'attendance_daily_id', 'field',
        'original_check_in', 'original_check_out', 'new_check_in', 'new_check_out',
        'original_status', 'new_status', 'reason', 'approval_status',
        'requested_by', 'approved_by', 'approved_at', 'approval_remarks', 'ip_address',
    ];

    protected function casts(): array
    {
        return [
            'attendance_date' => 'date',
            'original_check_in' => 'datetime',
            'original_check_out' => 'datetime',
            'new_check_in' => 'datetime',
            'new_check_out' => 'datetime',
            'approved_at' => 'datetime',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function attendanceDaily()
    {
        return $this->belongsTo(AttendanceDaily::class);
    }
}
