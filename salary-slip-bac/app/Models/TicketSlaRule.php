<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TicketSlaRule extends Model
{
    /** Marks the company-wide default. See the migration for why not NULL. */
    public const GLOBAL_DEPARTMENT = '';

    protected $fillable = [
        'department', 'priority', 'response_hours', 'resolution_hours',
        'auto_escalate', 'escalate_after_hours',
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

    public function isGlobal(): bool
    {
        return ($this->department ?? '') === self::GLOBAL_DEPARTMENT;
    }

    /**
     * The rule that governs a ticket: the department's own override if one
     * exists, otherwise the company-wide default for that priority.
     *
     * Returns null when neither is configured. That is deliberate — a ticket
     * with no rule gets no sla_due_at, and every SLA figure then honestly
     * excludes it rather than being measured against an invented deadline.
     */
    public static function resolve(?string $priority, ?string $department = null): ?self
    {
        if (! $priority) {
            return null;
        }

        // One query, then pick in PHP: the table is tiny and this keeps the
        // precedence rule visible instead of buried in an ORDER BY.
        $candidates = static::where('priority', $priority)
            ->whereIn('department', array_filter([trim((string) $department), self::GLOBAL_DEPARTMENT], fn ($v) => $v !== null))
            ->get();

        return $candidates->firstWhere('department', trim((string) $department))
            ?? $candidates->firstWhere('department', self::GLOBAL_DEPARTMENT);
    }

    /** Kept for callers that only know a priority. */
    public static function forPriority(?string $priority): ?self
    {
        return self::resolve($priority);
    }
}
