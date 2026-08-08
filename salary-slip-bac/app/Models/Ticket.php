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

    /** Waiting on the employee to answer a question; the SLA clock is paused. */
    public const STATUS_WAITING_EMPLOYEE = 'waiting_employee';

    /** Held for a sign-off before work continues. */
    public const STATUS_PENDING_APPROVAL = 'pending_approval';

    /** Raised a level, either manually or because the SLA target passed. */
    public const STATUS_ESCALATED = 'escalated';

    public const STATUSES = [
        self::STATUS_OPEN,
        self::STATUS_ASSIGNED,
        self::STATUS_IN_PROGRESS,
        self::STATUS_WAITING_EMPLOYEE,
        self::STATUS_PENDING_APPROVAL,
        self::STATUS_ESCALATED,
        self::STATUS_RESOLVED,
        self::STATUS_CLOSED,
        self::STATUS_REOPENED,
    ];

    /** Statuses where the ticket is still someone's problem. */
    public const ACTIVE_STATUSES = [
        self::STATUS_OPEN,
        self::STATUS_ASSIGNED,
        self::STATUS_IN_PROGRESS,
        self::STATUS_WAITING_EMPLOYEE,
        self::STATUS_PENDING_APPROVAL,
        self::STATUS_ESCALATED,
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
        self::STATUS_OPEN => [
            self::STATUS_ASSIGNED, self::STATUS_IN_PROGRESS, self::STATUS_PENDING_APPROVAL,
            self::STATUS_WAITING_EMPLOYEE, self::STATUS_ESCALATED, self::STATUS_RESOLVED,
        ],
        self::STATUS_ASSIGNED => [
            self::STATUS_IN_PROGRESS, self::STATUS_PENDING_APPROVAL, self::STATUS_WAITING_EMPLOYEE,
            self::STATUS_ESCALATED, self::STATUS_RESOLVED, self::STATUS_OPEN,
        ],
        self::STATUS_IN_PROGRESS => [
            self::STATUS_WAITING_EMPLOYEE, self::STATUS_PENDING_APPROVAL, self::STATUS_ESCALATED,
            self::STATUS_RESOLVED, self::STATUS_ASSIGNED,
        ],
        // The employee answered, or the approver decided — either way it goes
        // back to being worked.
        self::STATUS_WAITING_EMPLOYEE => [
            self::STATUS_IN_PROGRESS, self::STATUS_ASSIGNED, self::STATUS_ESCALATED, self::STATUS_RESOLVED,
        ],
        self::STATUS_PENDING_APPROVAL => [
            self::STATUS_IN_PROGRESS, self::STATUS_ASSIGNED, self::STATUS_ESCALATED,
            self::STATUS_RESOLVED, self::STATUS_CLOSED,
        ],
        self::STATUS_ESCALATED => [
            self::STATUS_IN_PROGRESS, self::STATUS_ASSIGNED, self::STATUS_RESOLVED,
        ],
        self::STATUS_REOPENED => [
            self::STATUS_ASSIGNED, self::STATUS_IN_PROGRESS, self::STATUS_ESCALATED, self::STATUS_RESOLVED,
        ],
        self::STATUS_RESOLVED => [self::STATUS_CLOSED, self::STATUS_IN_PROGRESS],
        // Terminal. "Closed tickets become read-only" is a stated business rule.
        self::STATUS_CLOSED => [],
    ];

    /**
     * Fallback only. The live value is configurable under Helpdesk Settings —
     * see reopenWindowDays() — and this constant is what applies when the
     * settings table is not present.
     */
    public const REOPEN_WINDOW_DAYS = 7;

    public static function reopenWindowDays(): int
    {
        $days = \App\Support\HelpdeskSettings::int('helpdesk.reopen_window_days');

        return $days > 0 ? $days : self::REOPEN_WINDOW_DAYS;
    }

    protected $fillable = [
        'ticket_number', 'employee_id', 'category_id', 'subject', 'description',
        'priority', 'status', 'company_code', 'unit', 'department',
        'assigned_to', 'assigned_by', 'assigned_at',
        'resolved_at', 'closed_at', 'reopened_at', 'last_activity_at',
        'sla_due_at', 'first_response_at', 'sla_breached_at', 'escalation_level', 'escalated_at',
    ];

    protected function casts(): array
    {
        return [
            'assigned_at' => 'datetime',
            'resolved_at' => 'datetime',
            'closed_at' => 'datetime',
            'reopened_at' => 'datetime',
            'last_activity_at' => 'datetime',
            'sla_due_at' => 'datetime',
            'first_response_at' => 'datetime',
            'sla_breached_at' => 'datetime',
            'escalated_at' => 'datetime',
            'escalation_level' => 'integer',
        ];
    }

    /**
     * SLA fields the client renders, computed from stored columns.
     *
     * Appended so the queue, the drawer and the dashboard all read the same
     * numbers. Every one of these was a hard-coded string in the React
     * components before ("03h 45m", "96.8%"); they are derived here so there is
     * exactly one definition of "overdue".
     */
    protected $appends = ['sla_status', 'sla_remaining_seconds', 'sla_remaining', 'is_overdue'];

    /** Resolved and closed tickets have stopped consuming their SLA. */
    public function isSettled(): bool
    {
        return in_array($this->status, [self::STATUS_RESOLVED, self::STATUS_CLOSED], true);
    }

    /**
     * Seconds left against the resolution target: negative once past it.
     * Null when the ticket has no target, so the UI can say so rather than
     * showing a countdown it invented.
     */
    public function getSlaRemainingSecondsAttribute(): ?int
    {
        if (! $this->sla_due_at) {
            return null;
        }

        // A settled ticket's remaining time is frozen at the moment it was
        // resolved — otherwise a ticket resolved comfortably in time drifts into
        // looking breached simply because days passed afterwards.
        $reference = $this->isSettled()
            ? ($this->resolved_at ?? $this->closed_at ?? now())
            : now();

        return (int) $reference->diffInSeconds($this->sla_due_at, false);
    }

    /** on_track | at_risk | breached | none */
    public function getSlaStatusAttribute(): string
    {
        $remaining = $this->sla_remaining_seconds;

        if ($remaining === null) {
            return 'none';
        }

        if ($remaining < 0) {
            return 'breached';
        }

        // "At risk" is the last quarter of the window, matching the threshold
        // the SLA Health panel describes.
        $rule = TicketSlaRule::forPriority($this->priority);
        $window = $rule ? $rule->resolution_hours * 3600 : null;

        if ($window && $window > 0 && $remaining <= $window * 0.25) {
            return 'at_risk';
        }

        return 'on_track';
    }

    public function getIsOverdueAttribute(): bool
    {
        return $this->sla_status === 'breached' && ! $this->isSettled();
    }

    /** "03h 45m", "-01h 10m" past due, or null when there is no target. */
    public function getSlaRemainingAttribute(): ?string
    {
        $remaining = $this->sla_remaining_seconds;

        if ($remaining === null) {
            return null;
        }

        $sign = $remaining < 0 ? '-' : '';
        $abs = abs($remaining);

        return sprintf('%s%02dh %02dm', $sign, intdiv($abs, 3600), intdiv($abs % 3600, 60));
    }

    /**
     * Stamp the resolution target from the rule in force right now.
     * No rule for the priority means no target, deliberately — see
     * TicketSlaRule::forPriority.
     */
    public function applySlaTarget(?\DateTimeInterface $from = null): void
    {
        // Department first, then the company-wide default — Payroll and IT can
        // hold different targets for the same priority.
        $rule = TicketSlaRule::resolve($this->priority, $this->department);

        if (! $rule) {
            return;
        }

        $start = $from ?? $this->created_at ?? now();
        $this->sla_due_at = \Illuminate\Support\Carbon::instance(
            $start instanceof \Illuminate\Support\Carbon ? $start : \Illuminate\Support\Carbon::parse($start)
        )->addHours($rule->resolution_hours);
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

        return $this->resolved_at->diffInDays(now()) <= self::reopenWindowDays();
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
