<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A dated entry on a calendar (02.10).
 *
 * `kind` is holiday / optional / workday. A `workday` entry is how a company
 * declares a working day inside an otherwise non-working weekly pattern; the
 * service allows it and forbids the reverse confusion by validating the weekly
 * pattern. `recurring = annual` repeats without being copied to each year.
 * The unique key is (calendar_id, date), which the service upserts on.
 */
class CalendarHoliday extends Model
{
    public const KINDS = ['holiday', 'optional', 'workday'];

    protected $fillable = [
        'calendar_id',
        'date',
        'title',
        'kind',
        'is_half_day',
        'recurring',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date',
            'is_half_day' => 'boolean',
        ];
    }

    public function calendar()
    {
        return $this->belongsTo(Calendar::class);
    }
}