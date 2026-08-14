<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A calendar — the working-week schedule master for a company and optionally a
 * unit (02.10).
 *
 * `unit_id` NULL means the company-default calendar that applies where no
 * unit-specific calendar answers; a unit calendar overrides it for that unit.
 * `work_week` is a JSON array of 3-letter day keys; NULL means Monday–Friday.
 * Holidays are dated rows in calendar_holidays. A name is unique within the
 * (company, unit) pair.
 */
class Calendar extends Model
{
    protected $fillable = [
        'company_id',
        'unit_id',
        'name',
        'description',
        'work_week',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'work_week' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function unit()
    {
        return $this->belongsTo(Unit::class);
    }

    public function holidays()
    {
        return $this->hasMany(CalendarHoliday::class);
    }
}