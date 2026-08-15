<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class WfhCheckIn extends Model
{
    protected $table = 'wfh_check_ins';

    protected $fillable = [
        'wfh_request_id',
        'user_id',
        'check_in_date',
        'check_in_time',
        'check_out_time',
        'status',
        'location',
        'activity_log',
    ];

    protected $casts = [
        'check_in_date' => 'date',
        'check_in_time' => 'datetime:H:i',
        'check_out_time' => 'datetime:H:i',
        'activity_log' => 'array',
    ];

    public const STATUSES = [
        'present' => 'Present',
        'late' => 'Late',
        'absent' => 'Absent',
    ];

    public function wfhRequest(): BelongsTo
    {
        return $this->belongsTo(WorkFromHomeRequest::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function scopeForDate($query, $date)
    {
        return $query->where('check_in_date', $date);
    }

    public function scopeForUser($query, $userId)
    {
        return $query->where('user_id', $userId);
    }

    public function scopeForRequest($query, $requestId)
    {
        return $query->where('wfh_request_id', $requestId);
    }

    public function getDurationAttribute(): ?float
    {
        if (!$this->check_in_time || !$this->check_out_time) {
            return null;
        }

        $in = \Carbon\Carbon::parse($this->check_in_time);
        $out = \Carbon\Carbon::parse($this->check_out_time);
        
        return $in->diffInMinutes($out) / 60;
    }

    public function isLate(): bool
    {
        if (!$this->check_in_time || !$this->wfhRequest->check_in_schedule) {
            return false;
        }

        $schedule = $this->wfhRequest->check_in_schedule[$this->check_in_date->format('l')] ?? null;
        if (!$schedule) {
            return false;
        }

        $expected = \Carbon\Carbon::parse($schedule['check_in']);
        $actual = \Carbon\Carbon::parse($this->check_in_time);

        return $actual->gt($expected);
    }
}