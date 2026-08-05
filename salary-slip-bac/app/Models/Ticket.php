<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Ticket extends Model
{
    public const STATUS_OPEN = 'open';

    public const STATUS_ASSIGNED = 'assigned';

    public const STATUS_IN_PROGRESS = 'in_progress';

    public const STATUS_RESOLVED = 'resolved';

    public const STATUS_CLOSED = 'closed';

    public const STATUS_REOPENED = 'reopened';

    public const STATUSES = [
        self::STATUS_OPEN,
        self::STATUS_ASSIGNED,
        self::STATUS_IN_PROGRESS,
        self::STATUS_RESOLVED,
        self::STATUS_CLOSED,
        self::STATUS_REOPENED,
    ];

    public const PRIORITIES = ['low', 'medium', 'high', 'urgent'];

    /**
     * Which status a staff member may move a ticket to from where it is now.
     *
     * Encoded rather than left to the caller so an out-of-order jump (say
     * open -> closed, skipping any actual work) cannot be produced by a
     * hand-made request. Reopening is not here: it is the employee's action, not
     * a staff transition, and has its own window check below.
     */
    public const TRANSITIONS = [
        self::STATUS_OPEN        => [self::STATUS_ASSIGNED, self::STATUS_IN_PROGRESS, self::STATUS_RESOLVED],
        self::STATUS_ASSIGNED    => [self::STATUS_IN_PROGRESS, self::STATUS_RESOLVED, self::STATUS_OPEN],
        self::STATUS_IN_PROGRESS => [self::STATUS_RESOLVED, self::STATUS_ASSIGNED],
        self::STATUS_REOPENED    => [self::STATUS_ASSIGNED, self::STATUS_IN_PROGRESS, self::STATUS_RESOLVED],
        self::STATUS_RESOLVED    => [self::STATUS_CLOSED, self::STATUS_IN_PROGRESS],
        // Terminal. "Closed tickets become read-only" is a stated business rule.
        self::STATUS_CLOSED      => [],
    ];

    /** Days a resolved ticket stays reopenable. Business rule 5. */
    public const REOPEN_WINDOW_DAYS = 7;

    protected $fillable = [
        'ticket_number', 'employee_id', 'category_id', 'subject', 'description',
        'priority', 'status', 'company_code', 'unit', 'department',
        'assigned_to', 'assigned_by', 'assigned_at',
        'resolved_at', 'closed_at', 'reopened_at', 'last_activity_at',
    ];

    protected function casts(): array
    {
        return [
            'assigned_at' => 'datetime',
            'resolved_at' => 'datetime',
            'closed_at' => 'datetime',
            'reopened_at' => 'datetime',
            'last_activity_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(User::class, 'employee_id');
    }

    public function category()
    {
        return $this->belongsTo(TicketCategory::class, 'category_id');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function messages()
    {
        return $this->hasMany(TicketMessage::class)->orderBy('created_at');
    }

    public function activityLogs()
    {
        return $this->hasMany(TicketActivityLog::class)->orderBy('created_at');
    }

    public function attachments()
    {
        return $this->hasMany(TicketAttachment::class);
    }

    public function isClosed(): bool
    {
        return $this->status === self::STATUS_CLOSED;
    }

    public function canTransitionTo(string $next): bool
    {
        return in_array($next, self::TRANSITIONS[$this->status] ?? [], true);
    }

    /**
     * A resolved ticket the employee can still push back, inside the window.
     *
     * Closed is deliberately excluded: closing is the employee's own
     * confirmation, and letting it be undone would make "closed" meaningless.
     */
    public function canBeReopened(): bool
    {
        if ($this->status !== self::STATUS_RESOLVED) {
            return false;
        }

        if ($this->resolved_at === null) {
            return true;
        }

        return $this->resolved_at->diffInDays(now()) <= self::REOPEN_WINDOW_DAYS;
    }

    /**
     * Restrict a query to what this user is allowed to see.
     *
     * Mirrors the tenancy rules the rest of the app already uses:
     *   role 0 (Super Admin) — everything.
     *   role 1 (Admin)       — their company_code, which may be a comma list
     *                          ("nidhi-impex,silver-star") or the 'all' wildcard.
     *   role 2 (Manager)     — their company and their unit.
     *   everyone else        — only tickets they raised.
     *
     * The comma/wildcard handling matches App\Services\Authorization\ScopeMatcher
     * and AuthorizedUserQuery. A multi-company admin whose code is a list must
     * not fall through to "no companies" and silently see an empty desk.
     */
    public function scopeVisibleTo(Builder $query, ?User $actor): Builder
    {
        if (! $actor) {
            return $query->whereRaw('1 = 0');
        }

        $role = (int) $actor->role;

        if ($role === 0) {
            return $query;
        }

        if ($role !== 1 && $role !== 2) {
            return $query->where('employee_id', $actor->id);
        }

        $companies = array_values(array_filter(array_map(
            'trim',
            explode(',', (string) $actor->company_code)
        )));

        if (! array_intersect(['all', 'all-companies'], $companies)) {
            $query->whereIn('company_code', $companies ?: ['__none__']);
        }

        if ($role === 2 && filled($actor->unit)) {
            $query->where('unit', $actor->unit);
        }

        return $query;
    }
}
