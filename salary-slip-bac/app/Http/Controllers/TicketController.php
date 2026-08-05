<?php

namespace App\Http\Controllers;

use App\Models\Ticket;
use App\Models\TicketActivityLog;
use App\Models\TicketCategory;
use App\Models\TicketMessage;
use App\Models\User;
use App\Support\AuditLogger;
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

            $this->record($ticket, 'CREATED', null, Ticket::STATUS_OPEN);

            return $ticket;
        });

        AuditLogger::log($request, 'CREATE', 'Tickets', null, [
            'id' => $ticket->id,
            'ticket_number' => $ticket->ticket_number,
            'category_id' => $ticket->category_id,
            'priority' => $ticket->priority,
        ]);

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

        $message = DB::transaction(function () use ($ticket, $data, $internal) {
            $message = TicketMessage::create([
                'ticket_id' => $ticket->id,
                'sender_id' => $this->actor()->id,
                'message' => $data['message'],
                'is_internal' => $internal,
            ]);

            $ticket->forceFill(['last_activity_at' => now()])->save();
            $this->record($ticket, $internal ? 'INTERNAL_NOTE' : 'REPLIED');

            return $message;
        });

        AuditLogger::log($request, $internal ? 'INTERNAL_NOTE' : 'REPLY', 'Tickets', null, [
            'ticket_id' => $ticket->id,
            'ticket_number' => $ticket->ticket_number,
        ]);

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

        return response()->json([
            'status' => true,
            'message' => "Ticket marked {$next}",
            'data' => $ticket->fresh(),
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
                    ? 'The '.Ticket::REOPEN_WINDOW_DAYS.'-day window to reopen this ticket has passed.'
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

        $summary = [
            'total' => array_sum($byStatus),
            'by_status' => $byStatus,
            'by_priority' => $base()
                ->select('priority', DB::raw('count(*) as total'))
                ->groupBy('priority')
                ->pluck('total', 'priority'),
            'resolved_today' => $base()->whereDate('resolved_at', today())->count(),
            'closed_today' => $base()->whereDate('closed_at', today())->count(),
        ];

        if ($staff) {
            $summary['assigned_to_me'] = $base()->where('assigned_to', $actor->id)
                ->whereNotIn('status', [Ticket::STATUS_CLOSED])->count();
            $summary['unassigned'] = $base()->whereNull('assigned_to')
                ->whereNotIn('status', [Ticket::STATUS_CLOSED, Ticket::STATUS_RESOLVED])->count();
            $summary['by_category'] = $base()
                ->select('ticket_categories.name', DB::raw('count(*) as total'))
                ->leftJoin('ticket_categories', 'ticket_categories.id', '=', 'tickets.category_id')
                ->groupBy('ticket_categories.name')
                ->pluck('total', 'name');
        }

        $recent = $base()
            ->with(['employee:id,name,emp_code', 'category:id,name', 'assignee:id,name'])
            ->orderByDesc('created_at')
            ->limit(10)
            ->get();

        return response()->json([
            'status' => true,
            'data' => ['summary' => $summary, 'recent' => $recent],
        ]);
    }
}
