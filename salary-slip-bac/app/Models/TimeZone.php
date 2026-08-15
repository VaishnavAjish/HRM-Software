<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * TimeZone — Domain 00.3 Global Master Data.
 *
 * Standard time-zone identifiers using IANA zone names (e.g., "America/New_York",
 * "Europe/London", "Asia/Kolkata"). Do not store only fixed UTC offsets as
 * authoritative time-zone identity.
 *
 * Uses standard time-zone identifiers per Domain 00.03.
 */
class TimeZone extends Model
{
    protected $fillable = [
        'identifier',
        'utc_offset',
        'is_dst',
        'dst_offset',
        'dst_start',
        'dst_end',
    ];

    protected $casts = [
        'is_dst' => 'boolean',
        'dst_offset' => 'float',
    ];

    public $timestamps = false;

    public static function supportedTimeZones(): array
    {
        return [
            'UTC' => ['utc_offset' => 0, 'is_dst' => false],
            'America/New_York' => ['utc_offset' => -5, 'is_dst' => true, 'dst_offset' => -4],
            'America/Chicago' => ['utc_offset' => -6, 'is_dst' => true, 'dst_offset' => -5],
            'America/Denver' => ['utc_offset' => -7, 'is_dst' => true, 'dst_offset' => -6],
            'America/Los_Angeles' => ['utc_offset' => -8, 'is_dst' => true, 'dst_offset' => -7],
            'Europe/London' => ['utc_offset' => 0, 'is_dst' => true, 'dst_offset' => 1],
            'Europe/Paris' => ['utc_offset' => 1, 'is_dst' => true, 'dst_offset' => 2],
            'Europe/Berlin' => ['utc_offset' => 1, 'is_dst' => true, 'dst_offset' => 2],
            'Asia/Shanghai' => ['utc_offset' => 8, 'is_dst' => false],
            'Asia/Kolkata' => ['utc_offset' => 5.5, 'is_dst' => false],
            'Asia/Tokyo' => ['utc_offset' => 9, 'is_dst' => false],
            'Asia/Dubai' => ['utc_offset' => 4, 'is_dst' => false],
            'Australia/Sydney' => ['utc_offset' => 10, 'is_dst' => true, 'dst_offset' => 11],
            'UTC' => ['utc_offset' => 0, 'is_dst' => false],
        ];
    }

    public function staticByIdentifier(string $identifier): ?array
    {
        $zones = $this->supportedTimeZones();
        return $zones[$identifier] ?? null;
    }

    public function utcOffsetHours(): float
    {
        return $this->utc_offset ?? 0;
    }

    public function isDst(): bool
    {
        return $this->is_dst ?? false;
    }
}