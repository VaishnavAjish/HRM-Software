<?php

namespace App\Services\Tickets;

use App\Models\Ticket;
use App\Models\TicketActivityLog;
use App\Models\TicketAssignmentHistory;
use App\Models\TicketEscalationHistory;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Routes a ticket to its first authority and moves it up the chain.
 *
 * Both entry points write the same history, so a ticket's ownership can always
 * be reconstructed regardless of whether a person or the scheduler moved it.
 */
class TicketRouter
{
    public function __construct(private readonly ReportingHierarchy $hierarchy)
    {
    }

    /**
     * Attach the hierarchy to a freshly created ticket and hand it to the
     * employee's direct manager.
     *
     * The snapshot is written even when there is no manager to route to, so a
     * ticket raised by someone with no reporting line still records that fact
     * rather than looking like the feature was off.
     */
    public function routeNewTicket(Ticket $ticket, User $employee): void
    {
        $snapshot = $this->hierarchy->snapshotFor($employee, $ticket->created_at);

        /*
         * The first authority is the head of the stored chain, not
         * managerFor() directly. For an employee with a reporting line those
         * are the same person. For one without, the chain still terminates at
         * the final authority — and taking the head here is what routes their
         * ticket to that Super Admin instead of leaving it assigned to nobody
         * while the snapshot claimed an owner.
         */
        $firstAuthority = isset($snapshot[0]['user_id'])
            ? User::find($snapshot[0]['user_id'])
            : null;

        $changes = [
            'hierarchy_snapshot' => $snapshot,
            // Level 0 = with the first authority, before any escalation.
            'escalation_level' => 0,
        ];

        if ($firstAuthority) {
            $changes['assigned_to'] = $firstAuthority->id;
            // The system routed this, so assigned_by stays null — it was not a
            // person's decision.
            $changes['assigned_by'] = null;
            $changes['assigned_at'] = now();
            $changes['routed_to'] = $firstAuthority->id;
            $changes['status'] = Ticket::STATUS_ASSIGNED;
        }

        $ticket->forceFill($changes)->save();

        if (! $firstAuthority) {
            return;
        }

        $role = ($snapshot[0]['is_final_authority'] ?? false)
            ? 'final authority — no reporting manager on file'
            : 'reporting manager';

        TicketAssignmentHistory::create([
            'ticket_id' => $ticket->id,
            'from_user_id' => null,
            'to_user_id' => $firstAuthority->id,
            'method' => TicketAssignmentHistory::METHOD_ROUTING,
            'performed_by' => null,
            'reason' => "Routed to the employee's {$role}.",
            'created_at' => now(),
        ]);

        TicketActivityLog::create([
            'ticket_id' => $ticket->id,
            'action' => 'ROUTED',
            'performed_by' => null,
            'old_status' => Ticket::STATUS_OPEN,
            'new_status' => Ticket::STATUS_ASSIGNED,
            'remarks' => "Assigned to {$firstAuthority->name} ({$role}).",
            'created_at' => now(),
        ]);
    }

    /**
     * The authority one step above where the ticket currently sits.
     *
     * Read from the stored snapshot, not recomputed — the chain in force when
     * the ticket was raised is the one it escalates through, even if somebody's
     * manager changed in the meantime.
     */
    public function nextAuthorityFor(Ticket $ticket): ?User
    {
        $snapshot = $ticket->hierarchy_snapshot ?: [];

        // escalation_level 0 sits with snapshot level 1; escalating moves to
        // level 2, and so on.
        $targetLevel = ((int) $ticket->escalation_level) + 2;

        foreach ($snapshot as $entry) {
            if ((int) ($entry['level'] ?? 0) !== $targetLevel) {
                continue;
            }

            $user = User::find($entry['user_id'] ?? null);

            // Somebody in the chain may have left since the snapshot was taken.
            return $user && $this->hierarchy->isEligibleManager($user) ? $user : $this->skipTo($snapshot, $targetLevel);
        }

        return null;
    }

    /** Walks past departed managers to the next reachable authority. */
    private function skipTo(array $snapshot, int $fromLevel): ?User
    {
        foreach ($snapshot as $entry) {
            if ((int) ($entry['level'] ?? 0) <= $fromLevel) {
                continue;
            }

            $user = User::find($entry['user_id'] ?? null);

            if ($user && $this->hierarchy->isEligibleManager($user)) {
                return $user;
            }
        }

        return null;
    }

    /**
     * Move a ticket one step up the chain.
     *
     * Returns the new authority, or null when the ticket is already with the
     * final one — the caller decides what to do about that (typically: leave it
     * with the Super Admin and stop escalating).
     */
    public function escalate(
        Ticket $ticket,
        string $trigger = TicketEscalationHistory::TRIGGER_INACTIVITY,
        ?User $performedBy = null,
        ?string $reason = null,
    ): ?User {
        $next = $this->nextAuthorityFor($ticket);

        if (! $next) {
            return null;
        }

        $previous = $ticket->assigned_to;
        $fromLevel = (int) $ticket->escalation_level;
        $oldStatus = $ticket->status;

        DB::transaction(function () use ($ticket, $next, $previous, $fromLevel, $trigger, $performedBy, $reason, $oldStatus) {
            $ticket->forceFill([
                'previous_assigned_to' => $previous,
                'assigned_to' => $next->id,
                'assigned_by' => $performedBy?->id,
                'assigned_at' => now(),
                'escalation_level' => $fromLevel + 1,
                'escalated_at' => now(),
                'status' => Ticket::STATUS_ESCALATED,
                'last_activity_at' => now(),
                // The new authority has not acted yet; their inactivity window
                // starts now rather than inheriting the previous holder's.
                'authority_action_at' => null,
            ])->save();

            TicketEscalationHistory::create([
                'ticket_id' => $ticket->id,
                'from_level' => $fromLevel,
                'to_level' => $fromLevel + 1,
                'from_user_id' => $previous,
                'to_user_id' => $next->id,
                'trigger' => $trigger,
                'performed_by' => $performedBy?->id,
                'reason' => $reason,
                'created_at' => now(),
            ]);

            TicketAssignmentHistory::create([
                'ticket_id' => $ticket->id,
                'from_user_id' => $previous,
                'to_user_id' => $next->id,
                'method' => TicketAssignmentHistory::METHOD_ESCALATION,
                'performed_by' => $performedBy?->id,
                'reason' => $reason ?? 'Escalated to the next authority.',
                'created_at' => now(),
            ]);

            TicketActivityLog::create([
                'ticket_id' => $ticket->id,
                'action' => 'ESCALATED',
                'performed_by' => $performedBy?->id,
                'old_status' => $oldStatus,
                'new_status' => Ticket::STATUS_ESCALATED,
                'remarks' => $reason ?? "Escalated to {$next->name} (level ".($fromLevel + 1).').',
                'created_at' => now(),
            ]);
        });

        return $next;
    }

    /** True when the ticket is already with its final authority. */
    public function isAtFinalAuthority(Ticket $ticket): bool
    {
        return $this->nextAuthorityFor($ticket) === null;
    }
}
