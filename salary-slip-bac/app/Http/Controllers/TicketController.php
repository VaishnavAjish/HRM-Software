<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use App\Models\TicketActivityLog;
use App\Models\TicketCategory;
use App\Models\TicketMessage;
use App\Models\User;
use App\Support\AuditLogger;
use App\Support\TicketNotifier;
use App\Support\TicketNumber;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Support tickets for employees, admins and super admins.
 *
 * One controller for all three because they are the same records under different
 * scopes, and Ticket::scopeVisibleTo is the single place that decides who sees
 * what. Splitting it per role would mean three chances to get that rule wrong.
 */
class TicketController extends Controller
{
    private function actor(): ?User
    {
        return auth('api')->user();
    }

    private function isStaff(?User $actor): bool
    {
        return $actor !== null && in_array((int) $actor->role, [0, 1, 2], true);
    }

    /**
     * Load a ticket the caller is allowed to see, or null.
     *
     * Scope is applied in the query rather than checked afterwards so an
     * out-of-scope id is indistinguishable from one that does not exist — a
     * "forbidden" on a real id would confirm the ticket exists to someone with
     * no business knowing it.
     */
    private function findVisible(int $id): ?Ticket
    {
        return Ticket::query()
            ->visibleTo($this->actor())
            ->with([
                'employee:id,name,emp_code,email,department,designation,company_code,unit',
                'category:id,name,slug,default_department',
                'assignee:id,name,emp_code,email',
            ])
            ->find($id);
    }

    private function record(Ticket $ticket, string $action, ?string $old = null, ?string $new = null, ?string $remarks = null): void
    {
        TicketActivityLog::create([
            'ticket_id' => $ticket->id,
            'action' => $action,
            'performed_by' => optional($this->actor())->id,
            'old_status' => $old,
            'new_status' => $new,
            'remarks' => $remarks,
            'created_at' => now(),
        ]);
    }

    // ---------------------------------------------------------------------
    // Categories
    // ---------------------------------------------------------------------

    /** Every authenticated user needs this to fill in the raise-ticket form. */
    public function categories()
    {
        $categories = TicketCategory::where('is_active', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name', 'slug', 'description', 'default_department']);

        return response()->json(['status' => true, 'data' => $categories]);
    }

    // ---------------------------------------------------------------------
    // Listing
    // ---------------------------------------------------------------------

    public function index(Request $request)
    {
        $actor = $this->actor();

        $query = Ticket::query()
            ->visibleTo($actor)
            ->with([
                'employee:id,name,emp_code,department,company_code,unit',
                'category:id,name,slug',
                'assignee:id,name,emp_code',
            ]);

        // "mine" means different things either side of the desk: the employee's
        // own tickets, or the staff member's assigned queue.
        if ($request->boolean('mine')) {
            $this->isStaff($actor)
                ? $query->where('assigned_to', $actor->id)
                : $query->where('employee_id', $actor->id);
        }

        if ($request->filled('status')) {
            $statuses = array_filter(array_map('trim', explode(',', (string) $request->status)));
            $query->whereIn('status', $statuses);
        }

        if ($request->filled('priority')) {
            $query->where('priority', $request->priority);
        }

        if ($request->filled('category_id')) {
            $query->where('category_id', $request->category_id);
        }

        if ($request->filled('assigned_to')) {
            $query->where('assigned_to', $request->assigned_to);
        }

        // Company/unit narrowing on top of the scope above — never widening it,
        // because visibleTo has already constrained the query.
        if ($request->filled('company_code') && ! in_array($request->company_code, ['all', 'all-companies'], true)) {
            $codes = array_filter(array_map('trim', explode(',', (string) $request->company_code)));
            $query->whereIn('company_code', $codes ?: ['__none__']);
        }

        if ($request->filled('unit')) {
            $query->where('unit', $request->unit);
        }

        if ($request->filled('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }

        if ($request->filled('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }

        if ($request->filled('search')) {
            $term = trim((string) $request->search);
            $query->where(function ($q) use ($term) {
                $q->where('ticket_number', 'like', "%{$term}%")
                    ->orWhere('subject', 'like', "%{$term}%")
                    ->orWhereHas('employee', fn ($e) => $e->where('name', 'like', "%{$term}%")
                        ->orWhere('emp_code', 'like', "%{$term}%"));
            });
        }

        $counts = (clone $query)
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        $tickets = $query
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END")
            ->orderByDesc('created_at')
            ->paginate((int) ($request->limit ?? 25));

        return response()->json([
            'status' => true,
            'data' => $tickets,
            'meta' => [
                'counts' => $counts,
                'total' => array_sum($counts->toArray()),
            ],
        ]);
    }

    public function show($id)
    {
        $ticket = $this->findVisible((int) $id);

        if (! $ticket) {
            return response()->json(['status' => false, 'message' => 'Ticket not found'], 404);
        }

        $actor = $this->actor();
        $staff = $this->isStaff($actor);

        // Internal notes exist so staff can talk about a ticket without the
        // employee reading it, so they are filtered out of the payload rather
        // than merely hidden by the UI.
        $messages = $ticket->messages()
            ->when(! $staff, fn ($q) => $q->where('is_internal', false))
            ->with('sender:id,name,emp_code,role')
            ->get();

        $ticket->setRelation('messages', $messages);
        $ticket->load(['activityLogs.performer:id,name,emp_code']);

        return response()->json([
            'status' => true,
            'data' => $ticket,
            'meta' => [
                'can_reply' => ! $ticket->isClosed(),
                'can_reopen' => $ticket->canBeReopened() && (int) $ticket->employee_id === (int) $actor->id,
                'next_statuses' => $staff ? (Ticket::TRANSITIONS[$ticket->status] ?? []) : [],
                'is_staff' => $staff,
            ],
        ]);
    }

    // ---------------------------------------------------------------------
    // Create
    // ---------------------------------------------------------------------

    public function store(Request $request)
    {
        $actor = $this->actor();

        $data = $request->validate([
            'category_id' => 'required|integer|exists:ticket_categories,id',
            'subject' => 'required|string|max:200',
            'description' => 'required|string|max:5000',
            'priority' => 'required|in:'.implode(',', Ticket::PRIORITIES),
        ]);

        // Company, unit and department come from the signed-in employee, never
        // from the request: a raiser must not be able to file a ticket into
        // another company's queue by editing the payload.
        $ticket = DB::transaction(function () use ($data, $actor) {
            $ticket = Ticket::create([
                'ticket_number' => TicketNumber::next(),
                'employee_id' => $actor->id,
                'category_id' => $data['category_id'],
                'subject' => $data['subject'],
                'description' => $data['description'],
                'priority' => $data['priority'],
                'status' => Ticket::STATUS_OPEN,
                'company_code' => $actor->company_code,
                'unit' => $actor->unit,
                'department' => $actor->department,
                'last_activity_at' => now(),
            ]);

            // Stamped now, from the rule in force now — see Ticket::applySlaTarget.
            $ticket->applySlaTarget($ticket->created_at);
            $ticket->save();

            $this->record($ticket, 'CREATED', null, Ticket::STATUS_OPEN);

            return $ticket;
        });

        AuditLogger::log($request, 'CREATE', 'Tickets', null, [
            'id' => $ticket->id,
            'ticket_number' => $ticket->ticket_number,
            'category_id' => $ticket->category_id,
            'priority' => $ticket->priority,
        ]);

        // After the transaction commits: a notification about a ticket that
        // then failed to save would point at nothing.
        TicketNotifier::created($ticket->load('employee:id,name'), $actor);

        return response()->json([
            'status' => true,
            'message' => "Ticket {$ticket->ticket_number} created",
            'data' => $ticket->load('category:id,name,slug'),
        ], 201);
    }

    // ---------------------------------------------------------------------
    // Conversation
    // ---------------------------------------------------------------------

    public function reply(Request $request, $id)
    {
        $ticket = $this->findVisible((int) $id);

        if (! $ticket) {
            return response()->json(['status' => false, 'message' => 'Ticket not found'], 404);
        }

        // Business rule 4.
        if ($ticket->isClosed()) {
            return response()->json(['status' => false, 'message' => 'This ticket is closed and can no longer be replied to.'], 422);
        }

        $data = $request->validate([
            'message' => 'required|string|max:5000',
            'is_internal' => 'sometimes|boolean',
        ]);

        $staff = $this->isStaff($this->actor());
        $internal = $staff && $request->boolean('is_internal');

        $message = DB::transaction(function () use ($ticket, $data, $internal, $staff) {
            $message = TicketMessage::create([
                'ticket_id' => $ticket->id,
                'sender_id' => $this->actor()->id,
                'message' => $data['message'],
                'is_internal' => $internal,
            ]);

            $changes = ['last_activity_at' => now()];

            // First response is the first thing the employee actually sees from
            // staff, so an internal note does not count as one.
            if ($staff && ! $internal && $ticket->first_response_at === null) {
                $changes['first_response_at'] = now();
            }

            $ticket->forceFill($changes)->save();
            $this->record($ticket, $internal ? 'INTERNAL_NOTE' : 'REPLIED');

            return $message;
        });

        AuditLogger::log($request, $internal ? 'INTERNAL_NOTE' : 'REPLY', 'Tickets', null, [
            'ticket_id' => $ticket->id,
            'ticket_number' => $ticket->ticket_number,
        ]);

        TicketNotifier::replied($ticket->load('employee:id,name,role'), $message, $this->actor());

        return response()->json([
            'status' => true,
            'message' => $internal ? 'Internal note added' : 'Reply sent',
            'data' => $message->load('sender:id,name,emp_code,role'),
        ], 201);
    }

    // ---------------------------------------------------------------------
    // Staff actions
    // ---------------------------------------------------------------------

    public function assign(Request $request, $id)
    {
        $ticket = $this->findVisible((int) $id);

        if (! $ticket) {
            return response()->json(['status' => false, 'message' => 'Ticket not found'], 404);
        }

        if ($ticket->isClosed()) {
            return response()->json(['status' => false, 'message' => 'This ticket is closed and can no longer be reassigned.'], 422);
        }

        $data = $request->validate([
            'assigned_to' => 'required|integer|exists:users,id',
            'remarks' => 'nullable|string|max:500',
        ]);

        // The assignee has to be someone the assigner could already see, or an
        // admin could hand a ticket to an account in a company they have no
        // rights over — and then lose sight of it themselves.
        $assignee = User::query()->find($data['assigned_to']);
        if (! $assignee || ! $this->isStaff($assignee)) {
            return response()->json(['status' => false, 'message' => 'Tickets can only be assigned to an admin or manager account.'], 422);
        }

        $before = ['status' => $ticket->status, 'assigned_to' => $ticket->assigned_to];

        DB::transaction(function () use ($ticket, $data) {
            $old = $ticket->status;

            $ticket->forceFill([
                'assigned_to' => $data['assigned_to'],
                'assigned_by' => $this->actor()->id,
                'assigned_at' => now(),
                // Assigning an untouched ticket moves it along; one already in
                // progress keeps its status so reassigning does not rewind it.
                'status' => in_array($ticket->status, [Ticket::STATUS_OPEN, Ticket::STATUS_REOPENED], true)
                    ? Ticket::STATUS_ASSIGNED
                    : $ticket->status,
                'last_activity_at' => now(),
            ])->save();

            $this->record($ticket, 'ASSIGNED', $old, $ticket->status, $data['remarks'] ?? null);
        });

        AuditLogger::log($request, 'ASSIGN', 'Tickets', $before, [
            'ticket_number' => $ticket->ticket_number,
            'assigned_to' => $ticket->assigned_to,
            'status' => $ticket->status,
        ]);

        TicketNotifier::assigned($ticket->load('employee:id,name'), $this->actor());

        return response()->json([
            'status' => true,
            'message' => 'Ticket assigned',
            'data' => $ticket->fresh(['assignee:id,name,emp_code']),
        ]);
    }

    public function updateStatus(Request $request, $id)
    {
        $ticket = $this->findVisible((int) $id);

        if (! $ticket) {
            return response()->json(['status' => false, 'message' => 'Ticket not found'], 404);
        }

        $data = $request->validate([
            'status' => 'required|in:'.implode(',', Ticket::STATUSES),
            'remarks' => 'nullable|string|max:500',
        ]);

        $next = $data['status'];

        if (! $ticket->canTransitionTo($next)) {
            return response()->json([
                'status' => false,
                'message' => $ticket->isClosed()
                    ? 'This ticket is closed and is now read-only.'
                    : "A ticket cannot move from {$ticket->status} to {$next}.",
            ], 422);
        }

        $old = $ticket->status;

        DB::transaction(function () use ($ticket, $next, $data, $old) {
            $changes = ['status' => $next, 'last_activity_at' => now()];

            if ($next === Ticket::STATUS_RESOLVED) {
                $changes['resolved_at'] = now();
            }

            if ($next === Ticket::STATUS_CLOSED) {
                $changes['closed_at'] = now();
            }

            $ticket->forceFill($changes)->save();
            $this->record($ticket, 'STATUS_CHANGED', $old, $next, $data['remarks'] ?? null);
        });

        AuditLogger::log($request, 'STATUS_CHANGE', 'Tickets', ['status' => $old], [
            'ticket_number' => $ticket->ticket_number,
            'status' => $next,
        ]);

        TicketNotifier::statusChanged($ticket->load('employee:id,name'), $old, $next, $this->actor());

        return response()->json([
            'status' => true,
            'message' => "Ticket marked {$next}",
            'data' => $ticket->fresh(),
        ]);
    }

    public function destroy(Request $request, $id)
    {
        $ticket = $this->findVisible((int) $id);

        if (! $ticket) {
            return response()->json(['status' => false, 'message' => 'Ticket not found'], 404);
        }

        AuditLogger::log($request, 'DELETE', 'Tickets', [
            'ticket_number' => $ticket->ticket_number,
            'status' => $ticket->status,
        ], null);

        DB::transaction(function () use ($ticket) {
            TicketActivityLog::where('ticket_id', $ticket->id)->delete();
            TicketMessage::where('ticket_id', $ticket->id)->delete();
            $ticket->delete();
        });

        return response()->json([
            'status' => true,
            'message' => 'Ticket deleted successfully',
        ]);
    }

    /**
     * The employee pushes a resolved ticket back, inside the reopen window.
     *
     * Deliberately not a case of updateStatus: this is the raiser's action, only
     * on their own ticket, and it is the one transition a non-staff user may
     * make.
     */
    public function reopen(Request $request, $id)
    {
        $ticket = $this->findVisible((int) $id);

        if (! $ticket) {
            return response()->json(['status' => false, 'message' => 'Ticket not found'], 404);
        }

        $actor = $this->actor();

        if ((int) $ticket->employee_id !== (int) $actor->id && ! $this->isStaff($actor)) {
            return response()->json(['status' => false, 'message' => 'Only the employee who raised this ticket can reopen it.'], 403);
        }

        if (! $ticket->canBeReopened()) {
            return response()->json([
                'status' => false,
                'message' => $ticket->status === Ticket::STATUS_RESOLVED
                    ? 'The '.Ticket::reopenWindowDays().'-day window to reopen this ticket has passed.'
                    : 'Only a resolved ticket can be reopened.',
            ], 422);
        }

        $data = $request->validate(['reason' => 'required|string|max:1000']);

        DB::transaction(function () use ($ticket, $data, $actor) {
            $old = $ticket->status;

            $ticket->forceFill([
                'status' => Ticket::STATUS_REOPENED,
                'reopened_at' => now(),
                'resolved_at' => null,
                'last_activity_at' => now(),
            ])->save();

            // The reason belongs in the conversation, not only in the log — the
            // person picking the ticket back up reads the thread, not the audit.
            TicketMessage::create([
                'ticket_id' => $ticket->id,
                'sender_id' => $actor->id,
                'message' => $data['reason'],
                'is_internal' => false,
            ]);

            $this->record($ticket, 'REOPENED', $old, Ticket::STATUS_REOPENED, $data['reason']);
        });

        AuditLogger::log($request, 'REOPEN', 'Tickets', ['status' => Ticket::STATUS_RESOLVED], [
            'ticket_number' => $ticket->ticket_number,
        ]);

        return response()->json([
            'status' => true,
            'message' => 'Ticket reopened',
            'data' => $ticket->fresh(),
        ]);
    }

    /**
     * Accounts a ticket can be handed to, within the caller's own scope.
     *
     * Employees are excluded: a ticket is worked by staff, and offering every
     * employee in the company as an assignee is how tickets get parked on
     * someone with no access to the queue.
     */
    public function assignees(Request $request)
    {
        $actor = $this->actor();

        $query = User::query()
            ->where('is_deleted', 0)
            ->whereIn('role', [0, 1, 2]);

        if ((int) $actor->role !== 0) {
            $companies = array_values(array_filter(array_map('trim', explode(',', (string) $actor->company_code))));

            if (! array_intersect(['all', 'all-companies'], $companies)) {
                $query->where(function ($q) use ($companies) {
                    foreach ($companies as $code) {
                        $q->orWhere('company_code', 'like', "%{$code}%");
                    }
                });
            }
        }

        $users = $query->orderBy('name')->get(['id', 'name', 'emp_code', 'email', 'role', 'department', 'company_code']);

        return response()->json(['status' => true, 'data' => $users]);
    }

    // ---------------------------------------------------------------------
    // Dashboard
    // ---------------------------------------------------------------------

    /**
     * Everything the control centre's cards and panels display.
     *
     * Each figure here replaced a literal in the React components — the
     * department bars, branch loads, SLA compliance and average resolution time
     * were all invented client-side. They are computed from the caller's own
     * visible rows, so two admins with different company access see different,
     * correct numbers rather than one shared fiction.
     */
    public function dashboard(Request $request)
    {
        $actor = $this->actor();
        $staff = $this->isStaff($actor);

        $base = fn () => Ticket::query()->visibleTo($actor)
            ->when(! $staff, fn ($q) => $q->where('employee_id', $actor->id));

        $counts = $base()
            ->select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        $byStatus = [];
        foreach (Ticket::STATUSES as $status) {
            $byStatus[$status] = (int) ($counts[$status] ?? 0);
        }

        $byPriority = [];
        $priorityCounts = $base()
            ->select('priority', DB::raw('count(*) as total'))
            ->groupBy('priority')
            ->pluck('total', 'priority');
        foreach (Ticket::PRIORITIES as $priority) {
            $byPriority[$priority] = (int) ($priorityCounts[$priority] ?? 0);
        }

        $summary = [
            'total' => array_sum($byStatus),
            'by_status' => $byStatus,
            'by_priority' => $byPriority,
            'resolved_today' => $base()->whereDate('resolved_at', today())->count(),
            'closed_today' => $base()->whereDate('closed_at', today())->count(),
        ];

        if ($staff) {
            $summary['assigned_to_me'] = $base()->where('assigned_to', $actor->id)
                ->whereIn('status', Ticket::ACTIVE_STATUSES)->count();
            $summary['unassigned'] = $base()->whereNull('assigned_to')
                ->whereIn('status', Ticket::ACTIVE_STATUSES)->count();

            // Overdue: past the stored target and still someone's problem.
            $summary['sla_breached'] = $base()
                ->whereIn('status', Ticket::ACTIVE_STATUSES)
                ->whereNotNull('sla_due_at')
                ->where('sla_due_at', '<', now())
                ->count();

            $summary['at_risk'] = $this->atRiskCount($base());
            $summary['on_track'] = max(
                0,
                $base()->whereIn('status', Ticket::ACTIVE_STATUSES)->whereNotNull('sla_due_at')->count()
                    - $summary['sla_breached'] - $summary['at_risk']
            );

            $summary['by_department'] = $this->groupCounts($base(), 'department', 'Unassigned');
            $summary['by_branch'] = $this->groupCounts($base(), 'unit', 'Unspecified');
            $summary['by_company'] = $this->groupCounts($base(), 'company_code', 'Unspecified');

            $summary['by_category'] = $base()
                ->select('ticket_categories.name', DB::raw('count(*) as total'))
                ->leftJoin('ticket_categories', 'ticket_categories.id', '=', 'tickets.category_id')
                ->groupBy('ticket_categories.name')
                ->pluck('total', 'name');

            $summary['avg_resolution_hours'] = $this->averageResolutionHours($base());
            $summary['sla_compliance'] = $this->slaCompliance($base());
        }

        $recent = $base()
            ->with(['employee:id,name,emp_code', 'category:id,name', 'assignee:id,name,emp_code'])
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();

        return response()->json([
            'status' => true,
            'data' => ['summary' => $summary, 'recent' => $recent],
        ]);
    }

    /** [{ name, count }], biggest first — the shape the bar panels render. */
    private function groupCounts($query, string $column, string $emptyLabel): array
    {
        return $query
            ->select($column, DB::raw('count(*) as total'))
            ->groupBy($column)
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'name' => filled($row->{$column}) ? $row->{$column} : $emptyLabel,
                'count' => (int) $row->total,
            ])
            ->values()
            ->all();
    }

    /**
     * Active tickets inside the last quarter of their window.
     *
     * The threshold is per-priority, so this walks the rules rather than
     * applying one blanket fraction in SQL.
     */
    private function atRiskCount($query): int
    {
        $rules = \App\Models\TicketSlaRule::all();

        if ($rules->isEmpty()) {
            return 0;
        }

        $query->whereIn('status', Ticket::ACTIVE_STATUSES)
            ->whereNotNull('sla_due_at')
            ->where('sla_due_at', '>=', now());

        $query->where(function ($outer) use ($rules) {
            foreach ($rules as $rule) {
                $threshold = now()->addHours(max(1, (int) round($rule->resolution_hours * 0.25)));
                $outer->orWhere(function ($q) use ($rule, $threshold) {
                    $q->where('priority', $rule->priority)->where('sla_due_at', '<=', $threshold);
                });
            }
        });

        return $query->count();
    }

    /** Mean hours from raised to resolved, or null when nothing is resolved yet. */
    private function averageResolutionHours($query): ?float
    {
        $seconds = $query
            ->whereNotNull('resolved_at')
            ->select(DB::raw('avg(extract(epoch from (resolved_at - created_at))) as avg_seconds'))
            ->value('avg_seconds');

        return $seconds === null ? null : round(((float) $seconds) / 3600, 1);
    }

    /**
     * Share of resolved tickets that beat their target, as a percentage.
     *
     * Null — not 100 — when nothing has been resolved yet or no target was ever
     * set. A fresh deployment showing "100% compliance" would be a claim about
     * data that does not exist.
     */
    private function slaCompliance($query): ?float
    {
        $resolved = (clone $query)->whereNotNull('resolved_at')->whereNotNull('sla_due_at');
        $total = (clone $resolved)->count();

        if ($total === 0) {
            return null;
        }

        $withinTarget = (clone $resolved)->whereColumn('resolved_at', '<=', 'sla_due_at')->count();

        return round(($withinTarget / $total) * 100, 1);
    }

    // ---------------------------------------------------------------------
    // Escalation
    // ---------------------------------------------------------------------

    public function escalate(Request $request, $id)
    {
        $ticket = $this->findVisible((int) $id);

        if (! $ticket) {
            return response()->json(['status' => false, 'message' => 'Ticket not found'], 404);
        }

        if ($ticket->isSettled()) {
            return response()->json(['status' => false, 'message' => 'A resolved or closed ticket cannot be escalated.'], 422);
        }

        $data = $request->validate(['remarks' => 'nullable|string|max:500']);
        $old = $ticket->status;

        DB::transaction(function () use ($ticket, $data, $old) {
            $ticket->forceFill([
                'status' => Ticket::STATUS_ESCALATED,
                'escalation_level' => (int) $ticket->escalation_level + 1,
                'escalated_at' => now(),
                'last_activity_at' => now(),
            ])->save();

            $this->record($ticket, 'ESCALATED', $old, Ticket::STATUS_ESCALATED, $data['remarks'] ?? null);
        });

        AuditLogger::log($request, 'ESCALATE', 'Tickets', ['status' => $old], [
            'ticket_number' => $ticket->ticket_number,
            'escalation_level' => $ticket->escalation_level,
        ]);

        TicketNotifier::escalated($ticket->fresh()->load('employee:id,name'), $this->actor());

        return response()->json([
            'status' => true,
            'message' => "Escalated to level {$ticket->escalation_level}",
            'data' => $ticket->fresh(),
        ]);
    }

    /**
     * Apply one action to several tickets.
     *
     * Reports per-ticket outcomes instead of a single success: with a mixed
     * selection some will legitimately refuse (a closed ticket cannot be
     * escalated), and the caller needs to know which rather than being told
     * everything worked.
     */
    public function bulk(Request $request)
    {
        $data = $request->validate([
            'action' => 'required|in:escalate,assign,status,close',
            'ids' => 'required|array|min:1|max:200',
            'ids.*' => 'integer',
            'assigned_to' => 'required_if:action,assign|integer|exists:users,id',
            'status' => 'required_if:action,status|in:'.implode(',', Ticket::STATUSES),
            'remarks' => 'nullable|string|max:500',
        ]);

        $tickets = Ticket::query()->visibleTo($this->actor())->whereIn('id', $data['ids'])->get();

        $succeeded = [];
        $failed = [];

        foreach ($tickets as $ticket) {
            try {
                DB::transaction(function () use ($ticket, $data) {
                    $old = $ticket->status;

                    if ($data['action'] === 'escalate') {
                        if ($ticket->isSettled()) {
                            throw new \RuntimeException('already settled');
                        }
                        $ticket->forceFill([
                            'status' => Ticket::STATUS_ESCALATED,
                            'escalation_level' => (int) $ticket->escalation_level + 1,
                            'escalated_at' => now(),
                            'last_activity_at' => now(),
                        ])->save();
                        $this->record($ticket, 'ESCALATED', $old, Ticket::STATUS_ESCALATED, $data['remarks'] ?? null);

                        return;
                    }

                    if ($data['action'] === 'assign') {
                        if ($ticket->isClosed()) {
                            throw new \RuntimeException('closed');
                        }
                        $ticket->forceFill([
                            'assigned_to' => $data['assigned_to'],
                            'assigned_by' => $this->actor()->id,
                            'assigned_at' => now(),
                            'status' => in_array($ticket->status, [Ticket::STATUS_OPEN, Ticket::STATUS_REOPENED], true)
                                ? Ticket::STATUS_ASSIGNED
                                : $ticket->status,
                            'last_activity_at' => now(),
                        ])->save();
                        $this->record($ticket, 'ASSIGNED', $old, $ticket->status, $data['remarks'] ?? null);

                        return;
                    }

                    $next = $data['action'] === 'close' ? Ticket::STATUS_CLOSED : $data['status'];

                    if (! $ticket->canTransitionTo($next)) {
                        throw new \RuntimeException("cannot move from {$ticket->status} to {$next}");
                    }

                    $changes = ['status' => $next, 'last_activity_at' => now()];
                    if ($next === Ticket::STATUS_RESOLVED) {
                        $changes['resolved_at'] = now();
                    }
                    if ($next === Ticket::STATUS_CLOSED) {
                        $changes['closed_at'] = now();
                    }

                    $ticket->forceFill($changes)->save();
                    $this->record($ticket, 'STATUS_CHANGED', $old, $next, $data['remarks'] ?? null);
                });

                $succeeded[] = $ticket->ticket_number;
            } catch (\Throwable $e) {
                $failed[] = ['ticket' => $ticket->ticket_number, 'reason' => $e->getMessage()];
            }
        }

        // Ids the caller asked for that they cannot see are neither applied nor
        // acknowledged as existing.
        $missing = count($data['ids']) - $tickets->count();

        AuditLogger::log($request, 'BULK_'.strtoupper($data['action']), 'Tickets', null, [
            'succeeded' => $succeeded,
            'failed' => count($failed),
        ]);

        return response()->json([
            'status' => true,
            'message' => sprintf(
                '%d ticket(s) updated%s',
                count($succeeded),
                $failed || $missing ? ', '.(count($failed) + $missing).' skipped' : ''
            ),
            'data' => ['succeeded' => $succeeded, 'failed' => $failed, 'not_visible' => $missing],
        ]);
    }

    // ---------------------------------------------------------------------
    // SLA rules
    // ---------------------------------------------------------------------

    /**
     * Rules grouped by department, with the company-wide set first.
     *
     * `departments` lists what an override can be created for: the departments
     * that tickets actually carry, plus any that already have one. Offering a
     * hard-coded list would let an administrator configure a team this company
     * does not have.
     */
    public function slaRules()
    {
        $rules = \App\Models\TicketSlaRule::orderBy('department')
            ->orderByRaw("CASE priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END")
            ->get();

        $fromTickets = Ticket::query()
            ->visibleTo($this->actor())
            ->whereNotNull('department')
            ->where('department', '!=', '')
            ->distinct()
            ->pluck('department');

        $fromCategories = TicketCategory::whereNotNull('default_department')
            ->where('default_department', '!=', '')
            ->distinct()
            ->pluck('default_department');

        $departments = $fromTickets
            ->merge($fromCategories)
            ->merge($rules->pluck('department'))
            ->filter(fn ($d) => filled($d))
            ->unique()
            ->sort()
            ->values();

        return response()->json([
            'status' => true,
            'data' => [
                'global' => $rules->where('department', \App\Models\TicketSlaRule::GLOBAL_DEPARTMENT)->values(),
                'overrides' => $rules->where('department', '!=', \App\Models\TicketSlaRule::GLOBAL_DEPARTMENT)
                    ->groupBy('department')
                    ->map(fn ($group) => $group->values()),
                'departments' => $departments,
                'priorities' => Ticket::PRIORITIES,
            ],
        ]);
    }

    public function updateSlaRules(Request $request)
    {
        $data = $request->validate([
            'rules' => 'required|array|min:1',
            'rules.*.department' => 'nullable|string|max:100',
            'rules.*.priority' => 'required|in:'.implode(',', Ticket::PRIORITIES),
            'rules.*.response_hours' => 'required|integer|min:1|max:720',
            'rules.*.resolution_hours' => 'required|integer|min:1|max:2160',
            'rules.*.auto_escalate' => 'required|boolean',
            'rules.*.escalate_after_hours' => 'required|integer|min:1|max:720',
        ]);

        // Rejected rather than silently corrected: a first-response target after
        // the resolution deadline is almost certainly a typo, and quietly
        // "fixing" it would hide the mistake behind numbers that look saved.
        foreach ($data['rules'] as $index => $rule) {
            if ($rule['response_hours'] > $rule['resolution_hours']) {
                return response()->json([
                    'status' => false,
                    'message' => "Row {$index}: first response ({$rule['response_hours']}h) cannot be later than resolution ({$rule['resolution_hours']}h).",
                ], 422);
            }
        }

        $before = \App\Models\TicketSlaRule::all()->toArray();

        DB::transaction(function () use ($data) {
            foreach ($data['rules'] as $rule) {
                \App\Models\TicketSlaRule::updateOrCreate(
                    [
                        'department' => trim((string) ($rule['department'] ?? '')),
                        'priority' => $rule['priority'],
                    ],
                    [
                        'response_hours' => $rule['response_hours'],
                        'resolution_hours' => $rule['resolution_hours'],
                        'auto_escalate' => $rule['auto_escalate'],
                        'escalate_after_hours' => $rule['escalate_after_hours'],
                    ]
                );
            }
        });

        // Existing tickets keep the target they were raised under — see the note
        // on the migration. Only new tickets pick up the change.
        AuditLogger::log($request, 'UPDATE', 'Ticket SLA Rules', $before, $data['rules']);

        return response()->json([
            'status' => true,
            'message' => 'SLA rules saved. They apply to tickets raised from now on.',
        ]);
    }

    /** Remove a department's override; it falls back to the global rules. */
    public function deleteSlaOverride(Request $request, string $department)
    {
        $department = trim($department);

        if ($department === \App\Models\TicketSlaRule::GLOBAL_DEPARTMENT) {
            return response()->json([
                'status' => false,
                'message' => 'The company-wide rules cannot be removed — every ticket falls back to them.',
            ], 422);
        }

        $deleted = \App\Models\TicketSlaRule::where('department', $department)->delete();

        if ($deleted === 0) {
            return response()->json(['status' => false, 'message' => 'No override found for that department'], 404);
        }

        AuditLogger::log($request, 'DELETE', 'Ticket SLA Rules', ['department' => $department], null);

        return response()->json([
            'status' => true,
            'message' => "{$department} now follows the company-wide rules.",
        ]);
    }

    // ---------------------------------------------------------------------
    // Helpdesk settings
    // ---------------------------------------------------------------------

    public function settings()
    {
        return response()->json([
            'status' => true,
            'data' => [
                'settings' => \App\Support\HelpdeskSettings::all(),
                'priorities' => Ticket::PRIORITIES,
            ],
        ]);
    }

    public function updateSettings(Request $request)
    {
        $data = $request->validate([
            'reopen_window_days' => 'required|integer|min:1|max:365',
            'auto_close_resolved_days' => 'required|integer|min:0|max:365',
            'default_priority' => 'required|in:'.implode(',', Ticket::PRIORITIES),
            'allow_manager_assignment' => 'required|boolean',
        ]);

        $before = \App\Support\HelpdeskSettings::all();

        $values = [
            'helpdesk.reopen_window_days' => (string) $data['reopen_window_days'],
            'helpdesk.auto_close_resolved_days' => (string) $data['auto_close_resolved_days'],
            'helpdesk.default_priority' => $data['default_priority'],
            'helpdesk.allow_manager_assignment' => $data['allow_manager_assignment'] ? 'true' : 'false',
        ];

        DB::transaction(function () use ($values) {
            foreach ($values as $key => $value) {
                \App\Models\Setting::updateOrCreate(
                    ['key' => $key],
                    ['value' => $value, 'group' => \App\Support\HelpdeskSettings::GROUP]
                );
            }
        });

        // The rest of this request must see the new values, not the ones cached
        // when it started.
        \App\Support\HelpdeskSettings::flush();

        AuditLogger::log($request, 'UPDATE', 'Helpdesk Settings', $before, $values);

        return response()->json([
            'status' => true,
            'message' => 'Helpdesk settings saved',
            'data' => ['settings' => \App\Support\HelpdeskSettings::all()],
        ]);
    }

    // ---------------------------------------------------------------------
    // Categories
    // ---------------------------------------------------------------------

    /** Admin view: inactive categories included, with usage counts. */
    public function allCategories()
    {
        $categories = TicketCategory::withCount('tickets')
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get();

        return response()->json(['status' => true, 'data' => $categories]);
    }

    public function storeCategory(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:100',
            'description' => 'nullable|string|max:500',
            'default_department' => 'nullable|string|max:100',
            'is_active' => 'sometimes|boolean',
            'sort_order' => 'nullable|integer|min:0|max:9999',
        ]);

        $slug = $this->uniqueSlug($data['name']);

        $category = TicketCategory::create([
            'name' => $data['name'],
            'slug' => $slug,
            'description' => $data['description'] ?? null,
            'default_department' => $data['default_department'] ?? null,
            'is_active' => $data['is_active'] ?? true,
            // Appended to the end by default so a new category does not jump the
            // order an administrator has already arranged.
            'sort_order' => $data['sort_order'] ?? ((int) TicketCategory::max('sort_order') + 10),
        ]);

        AuditLogger::log($request, 'CREATE', 'Ticket Categories', null, $category->toArray());

        return response()->json(['status' => true, 'message' => 'Category created', 'data' => $category], 201);
    }

    public function updateCategory(Request $request, $id)
    {
        $category = TicketCategory::find($id);

        if (! $category) {
            return response()->json(['status' => false, 'message' => 'Category not found'], 404);
        }

        $data = $request->validate([
            'name' => 'sometimes|required|string|max:100',
            'description' => 'nullable|string|max:500',
            'default_department' => 'nullable|string|max:100',
            'is_active' => 'sometimes|boolean',
            'sort_order' => 'nullable|integer|min:0|max:9999',
        ]);

        $before = $category->toArray();

        // The slug is the stable handle rows and seeds key on, so renaming a
        // category changes its label, not its identity.
        $category->update($data);

        AuditLogger::log($request, 'UPDATE', 'Ticket Categories', $before, $category->fresh()->toArray());

        return response()->json(['status' => true, 'message' => 'Category updated', 'data' => $category->fresh()]);
    }

    /**
     * Deactivate, or delete only when nothing has ever used it.
     *
     * Deleting a category with tickets behind it would null their category_id
     * and quietly rewrite history — the reports would lose the breakdown and the
     * tickets would show "Uncategorised" for work that was categorised at the
     * time. Deactivating keeps the record and just takes it off the raise form.
     */
    public function destroyCategory(Request $request, $id)
    {
        $category = TicketCategory::withCount('tickets')->find($id);

        if (! $category) {
            return response()->json(['status' => false, 'message' => 'Category not found'], 404);
        }

        $before = $category->toArray();

        if ($category->tickets_count > 0) {
            $category->update(['is_active' => false]);

            AuditLogger::log($request, 'DEACTIVATE', 'Ticket Categories', $before, $category->fresh()->toArray());

            return response()->json([
                'status' => true,
                'message' => "{$category->name} has {$category->tickets_count} ticket(s), so it was deactivated rather than deleted. It is hidden from the raise form and its history is intact.",
                'data' => $category->fresh(),
            ]);
        }

        $category->delete();

        AuditLogger::log($request, 'DELETE', 'Ticket Categories', $before, null);

        return response()->json(['status' => true, 'message' => 'Category deleted']);
    }

    private function uniqueSlug(string $name): string
    {
        $base = \Illuminate\Support\Str::slug($name) ?: 'category';
        $slug = $base;
        $suffix = 2;

        while (TicketCategory::where('slug', $slug)->exists()) {
            $slug = "{$base}-{$suffix}";
            $suffix++;
        }

        return $slug;
    }

    // ---------------------------------------------------------------------
    // Reports
    // ---------------------------------------------------------------------

    /**
     * Aggregated rows for the reports screen, in the caller's scope.
     *
     * Returns data the client turns into a spreadsheet — the export button used
     * to resolve a timer and claim success without producing a file.
     */
    public function reports(Request $request)
    {
        $data = $request->validate([
            'type' => 'required|in:company_wise,branch_wise,department_wise,employee_wise,category_wise,resolution_time,sla,escalation,high_priority,overdue',
            'from' => 'nullable|date',
            'to' => 'nullable|date',
        ]);

        $actor = $this->actor();

        $base = function () use ($actor, $data) {
            $query = Ticket::query()->visibleTo($actor);
            if (! empty($data['from'])) {
                $query->whereDate('created_at', '>=', $data['from']);
            }
            if (! empty($data['to'])) {
                $query->whereDate('created_at', '<=', $data['to']);
            }

            return $query;
        };

        $rows = match ($data['type']) {
            'company_wise' => $this->breakdownReport($base(), 'company_code', 'Company'),
            'branch_wise' => $this->breakdownReport($base(), 'unit', 'Branch'),
            'department_wise' => $this->breakdownReport($base(), 'department', 'Department'),
            'employee_wise' => $this->employeeReport($base()),
            'category_wise' => $this->categoryReport($base()),
            'resolution_time', 'sla' => $this->slaReport($base()),
            'escalation' => $this->ticketRows($base()->where('escalation_level', '>', 0)),
            'high_priority' => $this->ticketRows($base()->whereIn('priority', ['high', 'urgent'])),
            'overdue' => $this->ticketRows(
                $base()->whereIn('status', Ticket::ACTIVE_STATUSES)
                    ->whereNotNull('sla_due_at')->where('sla_due_at', '<', now())
            ),
        };

        return response()->json([
            'status' => true,
            'data' => ['type' => $data['type'], 'rows' => $rows, 'generated_at' => now()->toIso8601String()],
        ]);
    }

    private function breakdownReport($query, string $column, string $label): array
    {
        return $query
            ->select(
                $column,
                DB::raw('count(*) as total'),
                DB::raw("count(*) filter (where status = 'resolved') as resolved"),
                DB::raw("count(*) filter (where status = 'closed') as closed"),
                DB::raw('count(*) filter (where sla_breached_at is not null or (sla_due_at < now() and status not in (\'resolved\',\'closed\'))) as overdue'),
                DB::raw('avg(extract(epoch from (resolved_at - created_at))) as avg_seconds')
            )
            ->groupBy($column)
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                $label => filled($row->{$column}) ? $row->{$column} : 'Unspecified',
                'Total' => (int) $row->total,
                'Resolved' => (int) $row->resolved,
                'Closed' => (int) $row->closed,
                'Overdue' => (int) $row->overdue,
                'Avg Resolution (hrs)' => $row->avg_seconds === null ? '' : round(((float) $row->avg_seconds) / 3600, 1),
            ])
            ->all();
    }

    private function employeeReport($query): array
    {
        return $query
            ->select('users.name', 'users.emp_code', DB::raw('count(*) as total'),
                DB::raw("count(*) filter (where tickets.status in ('resolved','closed')) as settled"))
            ->join('users', 'users.id', '=', 'tickets.employee_id')
            ->groupBy('users.name', 'users.emp_code')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'Employee' => $row->name,
                'Emp Code' => $row->emp_code,
                'Tickets Raised' => (int) $row->total,
                'Settled' => (int) $row->settled,
            ])
            ->all();
    }

    private function categoryReport($query): array
    {
        return $query
            ->select('ticket_categories.name', DB::raw('count(*) as total'),
                DB::raw('avg(extract(epoch from (tickets.resolved_at - tickets.created_at))) as avg_seconds'))
            ->leftJoin('ticket_categories', 'ticket_categories.id', '=', 'tickets.category_id')
            ->groupBy('ticket_categories.name')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row) => [
                'Category' => $row->name ?: 'Uncategorised',
                'Total' => (int) $row->total,
                'Avg Resolution (hrs)' => $row->avg_seconds === null ? '' : round(((float) $row->avg_seconds) / 3600, 1),
            ])
            ->all();
    }

    private function slaReport($query): array
    {
        return $query
            ->select('priority', DB::raw('count(*) as total'),
                DB::raw('count(*) filter (where resolved_at is not null and sla_due_at is not null and resolved_at <= sla_due_at) as within_target'),
                DB::raw('count(*) filter (where resolved_at is not null and sla_due_at is not null and resolved_at > sla_due_at) as breached'),
                DB::raw('avg(extract(epoch from (first_response_at - created_at))) as avg_response_seconds'),
                DB::raw('avg(extract(epoch from (resolved_at - created_at))) as avg_resolution_seconds'))
            ->groupBy('priority')
            ->get()
            ->map(function ($row) {
                $judged = (int) $row->within_target + (int) $row->breached;

                return [
                    'Priority' => $row->priority,
                    'Total' => (int) $row->total,
                    'Within Target' => (int) $row->within_target,
                    'Breached' => (int) $row->breached,
                    // Blank, not 100, when nothing has been resolved to judge.
                    'Compliance %' => $judged === 0 ? '' : round(((int) $row->within_target / $judged) * 100, 1),
                    'Avg First Response (hrs)' => $row->avg_response_seconds === null ? '' : round(((float) $row->avg_response_seconds) / 3600, 1),
                    'Avg Resolution (hrs)' => $row->avg_resolution_seconds === null ? '' : round(((float) $row->avg_resolution_seconds) / 3600, 1),
                ];
            })
            ->all();
    }

    private function ticketRows($query): array
    {
        return $query
            ->with(['employee:id,name,emp_code', 'category:id,name', 'assignee:id,name'])
            ->orderByDesc('created_at')
            ->limit(1000)
            ->get()
            ->map(fn (Ticket $ticket) => [
                'Ticket No' => $ticket->ticket_number,
                'Subject' => $ticket->subject,
                'Employee' => $ticket->employee?->name,
                'Category' => $ticket->category?->name,
                'Priority' => $ticket->priority,
                'Status' => $ticket->status,
                'Escalation Level' => $ticket->escalation_level,
                'Assigned To' => $ticket->assignee?->name,
                'Company' => $ticket->company_code,
                'Branch' => $ticket->unit,
                'Created' => optional($ticket->created_at)->toDateTimeString(),
                'SLA Due' => optional($ticket->sla_due_at)->toDateTimeString(),
                'Overdue' => $ticket->is_overdue ? 'Yes' : 'No',
            ])
            ->all();
    }
}
