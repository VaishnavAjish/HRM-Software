<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceRecalculationJob extends Model
{
    public const STATUS_RUNNING = 'RUNNING';
    public const STATUS_SUCCESS = 'SUCCESS';
    public const STATUS_FAILED = 'FAILED';

    public const MODE_SYNC = 'sync';
    public const MODE_QUEUED = 'queued';

    protected $fillable = [
        'company_code', 'unit', 'department', 'employee_user_id',
        'date_from', 'date_to', 'mode', 'status',
        'processed_count', 'days_count', 'employees_count', 'error_message',
        'triggered_by', 'started_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'date_from' => 'date',
            'date_to' => 'date',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(User::class, 'employee_user_id');
    }

    public function triggeredBy()
    {
        return $this->belongsTo(User::class, 'triggered_by');
    }
}
