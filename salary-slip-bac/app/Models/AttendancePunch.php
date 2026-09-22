<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

/**
 * attendance_punches — the permanent, append-only raw biometric ledger.
 * See the creating migration's docblock for the full design rationale
 * (Attendance Engine Rebuild — Phase 0).
 *
 * Never update `emp_code_raw`, `device_serial`, `punch_datetime`, `source`
 * or `raw_line` after insert — those are the raw record. Only `status`,
 * `duplicate_of`, `user_id`/`company_code`/`unit` (resolution) and
 * `punch_date`/`attendance_day_resolved` (attendance-day resolution) are
 * ever written after creation, and only by the ingestor/recalculation
 * engine — never by a manual edit endpoint (manual corrections are a
 * separate, explicit regularization record in a later phase; see spec §19).
 */
class AttendancePunch extends Model
{
    public const STATUS_VALID = 'VALID';
    public const STATUS_DUPLICATE = 'DUPLICATE';
    public const STATUS_UNMAPPED = 'UNMAPPED';
    public const STATUS_INVALID = 'INVALID';

    public const STATUSES = [
        self::STATUS_VALID,
        self::STATUS_DUPLICATE,
        self::STATUS_UNMAPPED,
        self::STATUS_INVALID,
    ];

    public const SOURCE_ESSL = 'essl_biometric';
    public const SOURCE_MANUAL = 'manual';
    public const SOURCE_IMPORT = 'import';

    protected $fillable = [
        'emp_code_raw', 'device_serial', 'punch_datetime', 'punch_date',
        'attendance_day_resolved', 'punch_type', 'source', 'raw_line',
        'user_id', 'device_id', 'company_code', 'unit', 'sync_batch_id',
        'status', 'duplicate_of',
    ];

    protected function casts(): array
    {
        return [
            'punch_datetime' => 'datetime',
            'punch_date' => 'date',
            'attendance_day_resolved' => 'boolean',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function device()
    {
        return $this->belongsTo(AttendanceDevice::class, 'device_id');
    }

    public function syncBatch()
    {
        return $this->belongsTo(UploadBatch::class, 'sync_batch_id');
    }

    public function duplicateOf()
    {
        return $this->belongsTo(self::class, 'duplicate_of');
    }

    public function duplicates()
    {
        return $this->hasMany(self::class, 'duplicate_of');
    }

    public function scopeValid(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_VALID);
    }

    public function scopeUnmapped(Builder $query): Builder
    {
        return $query->where('status', self::STATUS_UNMAPPED);
    }
}
