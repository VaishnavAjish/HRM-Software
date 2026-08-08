<?php

namespace App\Support;

use App\Models\Notification;
use App\Models\Ticket;
use App\Models\TicketMessage;
use App\Models\User;
use Illuminate\Support\Collection;
use Throwable;

/**
 * Turns a ticket event into notifications for the people it concerns.
 *
 * Recipients are resolved with the same rule that decides who may *see* a
 * ticket (Ticket::scopeVisibleTo): a Super Admin sees everything, an Admin sees
 * their own companies — which may be a comma list — and a Manager is further
 * narrowed to their unit. Deriving delivery from visibility is deliberate: a
 * notification for a ticket the recipient cannot open would be worse than no
 * notification at all.
 *
 * Every method is best-effort. A notification that cannot be written must never
 * take down the action that triggered it — an employee's ticket is still raised
 * even if the admin's bell misses it, and the failure is reported rather than
 * swallowed.
 */
class TicketNotifier
{
    public const MODULE = 'Tickets';

    /** An employee raised a ticket: tell the staff who can act on it. */
    public static function created(Ticket $ticket, User $raiser): void
    {
        self::guard(function () use ($ticket, $raiser) {
            $recipients = self::staffFor($ticket)->reject(fn (User $u) => $u->id === $raiser->id);

            self::write($recipients, $ticket, [
                'title' => "New ticket {$ticket->ticket_number}: {$ticket->subject}",
                'description' => self::excerpt($ticket->description),
                'priority' => self::priorityLabel($ticket->priority),
                'triggered_by' => $raiser->name,
                'action_label' => 'Open Ticket',
            ]);
        });
    }

    /**
     * A reply landed. Staff replies go to the employee; the employee's reply
     * goes back to the staff side — never to the sender, and never to anyone
     * for an internal note except other staff.
     */
    public static function replied(Ticket $ticket, TicketMessage $message, User $sender): void
    {
        self::guard(function () use ($ticket, $message, $sender) {
            $senderIsStaff = self::isStaff($sender);

            if ($message->is_internal) {
                // Internal notes are staff-only, so the employee is not told one
                // exists — the whole point is that they cannot see it.
                $recipients = self::staffFor($ticket);
                $title = "Internal note on {$ticket->ticket_number}";
            } elseif ($senderIsStaff) {
                $recipients = collect([$ticket->employee])->filter();
                $title = "Reply on your ticket {$ticket->ticket_number}";
            } else {
                $recipients = self::staffFor($ticket);
                $title = "{$sender->name} replied on {$ticket->ticket_number}";
            }

            self::write($recipients->reject(fn (User $u) => $u->id === $sender->id), $ticket, [
                'title' => $title,
                'description' => self::excerpt($message->message),
                'priority' => self::priorityLabel($ticket->priority),
                'triggered_by' => $sender->name,
                'action_label' => 'Open Ticket',
            ]);
        });
    }

    /** Tell the new owner, and let the employee know someone has it. */
    public static function assigned(Ticket $ticket, ?User $actor): void
    {
        self::guard(function () use ($ticket, $actor) {
            $assignee = $ticket->assigned_to ? User::find($ticket->assigned_to) : null;

            $recipients = collect([$assignee, $ticket->employee])
                ->filter()
                ->unique('id')
                ->reject(fn (User $u) => $actor && $u->id === $actor->id);

            self::write($recipients, $ticket, [
                'title' => "Ticket {$ticket->ticket_number} assigned to ".($assignee?->name ?? 'a team member'),
                'description' => self::excerpt($ticket->subject),
                'priority' => self::priorityLabel($ticket->priority),
                'triggered_by' => $actor?->name,
                'action_label' => 'Open Ticket',
            ]);
        });
    }

    public static function statusChanged(Ticket $ticket, string $from, string $to, ?User $actor): void
    {
        self::guard(function () use ($ticket, $from, $to, $actor) {
            $assignee = $ticket->assigned_to ? User::find($ticket->assigned_to) : null;

            $recipients = collect([$ticket->employee, $assignee])
                ->filter()
                ->unique('id')
                ->reject(fn (User $u) => $actor && $u->id === $actor->id);

            self::write($recipients, $ticket, [
                'title' => "Ticket {$ticket->ticket_number} is now ".self::humanStatus($to),
                'description' => self::excerpt($ticket->subject),
                // Resolution and closure are routine; everything else keeps the
                // ticket's own urgency.
                'priority' => in_array($to, [Ticket::STATUS_RESOLVED, Ticket::STATUS_CLOSED], true)
                    ? 'Normal'
                    : self::priorityLabel($ticket->priority),
                'triggered_by' => $actor?->name,
                'action_label' => 'Open Ticket',
            ]);
        });
    }

    /** Escalation is the one event the whole staff side should see. */
    public static function escalated(Ticket $ticket, ?User $actor): void
    {
        self::guard(function () use ($ticket, $actor) {
            $recipients = self::staffFor($ticket)
                ->push($ticket->employee)
                ->filter()
                ->unique('id')
                ->reject(fn (User $u) => $actor && $u->id === $actor->id);

            self::write($recipients, $ticket, [
                'title' => "Ticket {$ticket->ticket_number} escalated to level {$ticket->escalation_level}",
                'description' => self::excerpt($ticket->subject),
                'priority' => 'Urgent',
                'triggered_by' => $actor?->name,
                'action_label' => 'Open Ticket',
            ]);
        });
    }

    // -----------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------

    /**
     * Staff who can see this ticket.
     *
     * The company match is done in PHP rather than SQL because company_code is
     * a comma list on the user ("nidhi-impex,silver-star") and may be the 'all'
     * wildcard; a LIKE would match 'silver' against 'silver-star-holdings'. The
     * staff table is small, so correctness wins over a cleverer query.
     */
    private static function staffFor(Ticket $ticket): Collection
    {
        $candidates = User::query()
            ->whereIn('role', [0, 1, 2])
            ->where('is_deleted', 0)
            ->get();

        return $candidates->filter(function (User $staff) use ($ticket) {
            if ((int) $staff->role === 0) {
                return true;
            }

            $companies = array_values(array_filter(array_map(
                'trim',
                explode(',', (string) $staff->company_code)
            )));

            if (array_intersect(['all', 'all-companies'], $companies)) {
                return true;
            }

            if (! in_array((string) $ticket->company_code, $companies, true)) {
                return false;
            }

            // A manager is scoped to their unit as well.
            if ((int) $staff->role === 2 && filled($staff->unit)) {
                return (string) $staff->unit === (string) $ticket->unit;
            }

            return true;
        })->values();
    }

    private static function isStaff(User $user): bool
    {
        return in_array((int) $user->role, [0, 1, 2], true);
    }

    private static function write(Collection $recipients, Ticket $ticket, array $payload): void
    {
        $recipients = $recipients->filter()->unique('id');

        if ($recipients->isEmpty()) {
            return;
        }

        $now = now();

        $rows = $recipients->map(fn (User $recipient) => array_merge([
            'user_id' => $recipient->id,
            'module' => self::MODULE,
            'priority' => 'Normal',
            // Staff open the control centre; the employee opens their own list.
            'action_url' => self::isStaff($recipient)
                ? '/admin/tickets/control-center'
                : '/employee/tickets',
            'related_employee' => $ticket->employee?->name,
            'department' => $ticket->department,
            'related_type' => 'ticket',
            'related_id' => $ticket->id,
            'read_at' => null,
            'created_at' => $now,
            'updated_at' => $now,
        ], $payload))->all();

        Notification::insert($rows);
    }

    private static function guard(callable $callback): void
    {
        try {
            $callback();
        } catch (Throwable $e) {
            // Reported, not swallowed: a missing notification is a real defect,
            // it just must not fail the ticket action that caused it.
            report($e);
        }
    }

    private static function excerpt(?string $text, int $limit = 160): string
    {
        $clean = trim(preg_replace('/\s+/', ' ', (string) $text));

        return mb_strlen($clean) > $limit ? mb_substr($clean, 0, $limit - 1).'…' : $clean;
    }

    private static function priorityLabel(?string $priority): string
    {
        return match ($priority) {
            'urgent' => 'Urgent',
            'high' => 'Urgent',
            default => 'Normal',
        };
    }

    private static function humanStatus(string $status): string
    {
        return ucwords(str_replace('_', ' ', $status));
    }
}
