<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TicketSlaRule extends Model
{
    protected $fillable = [
        'priority', 'response_hours', 'resolution_hours', 'auto_escalate', 'escalate_after_hours',
    ];

    protected function casts(): array
    {
        return [
            'auto_escalate' => 'boolean',
            'response_hours' => 'integer',
            'resolution_hours' => 'integer',
            'escalate_after_hours' => 'integer',
        ];
    }

    /**
     * The rule for a priority, or null when none is configured.
     *
     * Returns null rather than inventing a default: a ticket with no rule gets
     * no sla_due_at, and every SLA figure then honestly excludes it. Making one
     * up here would put a fabricated deadline on screen — the exact problem the
     * hard-coded UI had.
     */
    public static function forPriority(?string $priority): ?self
    {
        if (! $priority) {
            return null;
        }

        return static::where('priority', $priority)->first();
    }
}
