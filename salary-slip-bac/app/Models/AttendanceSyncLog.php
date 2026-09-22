<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceSyncLog extends Model
{
    public const STATUS_RUNNING = 'RUNNING';
    public const STATUS_SUCCESS = 'SUCCESS';
    public const STATUS_PARTIAL = 'PARTIAL';
    public const STATUS_FAILED = 'FAILED';

    protected $fillable = [
        'sync_batch_id', 'device_id', 'device_serial', 'company_code',
        'started_at', 'completed_at', 'status', 'fetched_count', 'inserted_count',
        'duplicate_count', 'unmapped_count', 'failed_count', 'error_message',
        'triggered_by', 'trigger_type',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function device()
    {
        return $this->belongsTo(AttendanceDevice::class, 'device_id');
    }

    public function syncBatch()
    {
        return $this->belongsTo(UploadBatch::class);
    }

    public function triggeredBy()
    {
        return $this->belongsTo(User::class, 'triggered_by');
    }

    public function durationSeconds(): ?int
    {
        if (! $this->started_at || ! $this->completed_at) {
            return null;
        }

        return $this->started_at->diffInSeconds($this->completed_at);
    }
}
