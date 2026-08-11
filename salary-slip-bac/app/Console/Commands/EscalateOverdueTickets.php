<?php

namespace App\Console\Commands;

use App\Models\Ticket;
use App\Models\TicketActivityLog;
use App\Models\TicketEscalationHistory;
use App\Models\TicketSlaRule;
use App\Services\Tickets\TicketRouter;
use App\Support\HelpdeskSettings;
use App\Support\TicketNotifier;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Escalates tickets nobody has picked up, and closes long-resolved ones.
 *
 * This is what makes the "Auto escalate" toggle on the SLA screen mean
 * something. Until now the flag and its timeout were stored and displayed, but
 * no process ever read them, so a ticket left untouched for a week stayed
 * exactly where it was — the setting looked live and did nothing.
 *
 * Scheduled every fifteen minutes (routes/console.php). Safe to run by hand and
 * safe to run twice: escalation is keyed off escalated_at, so a ticket does not
 * climb a level on every pass.
 */
class EscalateOverdueTickets extends Command
{
    protected $signature = 'tickets:escalate-overdue
                            {--dry-run : Report what would change without writing anything}';

    protected $description = 'Escalate unattended tickets past their SLA escalation window and auto-close long-resolved ones';

    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');

        $escalated = $this->escalateUnattended($dryRun);
        $closed = $this->closeLongResolved($dryRun);

        $this->info(sprintf(
            '%s%d escalated, %d auto-closed.',
            $dryRun ? '[dry run] ' : '',
            $escalated,
            $closed
        ));

        return self::SUCCESS;
    }

    /**
     * A ticket escalates when its department/priority rule says auto-escalate
     * and the authority holding it has not acted for escalate_after_hours.
     *
     * Already-escalated tickets stay eligible: escalation is now a walk up the
     * hierarchy rather than a one-off status change, so a level-1 authority who
     * also sits on it hands off to level 2. escalated_at keeps that to one step
     * per window.
     */
    private function escalateUnattended(bool $dryRun): int
    {
        $rules = TicketSlaRule::where('auto_escalate', true)->get();

        if ($rules->isEmpty()) {
            return 0;
        }

        $count = 0;

        foreach ($rules as $rule) {
            $cutoff = now()->subHours(max(1, $rule->escalate_after_hours));

            $query = Ticket::query()
                ->whereIn('status', Ticket::ACTIVE_STATUSES)
                ->where('priority', $rule->priority)
                /*
                 * Inactivity of the *authority*, not of the ticket.
                 *
                 * This used to read last_activity_at, which any event moves —
                 * including the employee's own replies. A ticket the assignee
                 * had never touched therefore looked "attended" as long as the
                 * employee kept chasing it, which is precisely the case
                 * escalation exists for. authority_action_at is stamped only by
                 * the configured staff actions; before the first of those it is
                 * null and the clock runs from creation.
                 */
                ->whereRaw('COALESCE(authority_action_at, created_at) < ?', [$cutoff])
                /*
                 * Waiting on the employee pauses the clock: the authority
                 * cannot act until the employee answers, so holding them to an
                 * inactivity deadline would escalate people for someone else's
                 * silence.
                 */
                ->where('status', '!=', Ticket::STATUS_WAITING_EMPLOYEE)
                // Don't re-escalate something escalated within this same window.
                ->where(fn ($q) => $q->whereNull('escalated_at')->orWhere('escalated_at', '<', $cutoff));

            if ($rule->isGlobal()) {
                // The global rule covers only departments with no override of
                // their own, otherwise it would double-govern them.
                $overridden = TicketSlaRule::where('priority', $rule->priority)
                    ->where('department', '!=', TicketSlaRule::GLOBAL_DEPARTMENT)
                    ->pluck('department');

                if ($overridden->isNotEmpty()) {
                    $query->where(function ($q) use ($overridden) {
                        $q->whereNull('department')
                            ->orWhere('department', '')
                            ->orWhereNotIn('department', $overridden);
                    });
                }
            } else {
                $query->where('department', $rule->department);
            }

            foreach ($query->cursor() as $ticket) {
                $count++;

                if ($dryRun) {
                    $this->line("  would escalate {$ticket->ticket_number} ({$ticket->priority}, {$ticket->department})");

                    continue;
                }

                $this->escalate($ticket);
            }
        }

        return $count;
    }

    /**
     * Hand the ticket to the next authority in its own chain.
     *
     * This used only to set status = escalated and bump a counter, which left
     * the ticket with the same person who had already not acted on it — the
     * label changed and nothing else did. It now reassigns up the stored
     * hierarchy, records who it came from, and notifies the new holder.
     *
     * A ticket already sitting with its final authority (the Super Admin) has
     * nowhere further to go. Rather than escalating in circles it is marked
     * escalated once and left there, since re-notifying the same person every
     * fifteen minutes trains people to ignore the alert.
     */
    private function escalate(Ticket $ticket): void
    {
        $router = app(TicketRouter::class);
        $previousHolder = $ticket->assigned_to;

        $next = $router->escalate(
            $ticket,
            TicketEscalationHistory::TRIGGER_INACTIVITY,
            null,
            'Automatically escalated: the assigned authority took no action within the configured window.'
        );

        if (! $next) {
            $this->markStuckAtFinalAuthority($ticket);

            return;
        }

        TicketNotifier::escalated($ticket->fresh()->load('employee:id,name'), null);

        $from = $previousHolder ? " from user #{$previousHolder}" : '';
        $this->line("  escalated {$ticket->ticket_number}{$from} to {$next->name} (level {$ticket->fresh()->escalation_level})");
    }

    /**
     * Nothing above the current holder: flag it once, then stop.
     *
     * escalated_at is stamped so the inactivity query stops selecting it on
     * every subsequent run.
     */
    private function markStuckAtFinalAuthority(Ticket $ticket): void
    {
        if ($ticket->status === Ticket::STATUS_ESCALATED) {
            $ticket->forceFill(['escalated_at' => now()])->save();

            return;
        }

        $old = $ticket->status;

        DB::transaction(function () use ($ticket, $old) {
            $ticket->forceFill([
                'status' => Ticket::STATUS_ESCALATED,
                'escalated_at' => now(),
                'last_activity_at' => now(),
            ])->save();

            TicketActivityLog::create([
                'ticket_id' => $ticket->id,
                'action' => 'ESCALATED',
                // No performer: the scheduler did this, not a person.
                'performed_by' => null,
                'old_status' => $old,
                'new_status' => Ticket::STATUS_ESCALATED,
                'remarks' => 'Escalated at the final authority — no higher level to route to.',
                'created_at' => now(),
            ]);
        });

        TicketNotifier::escalated($ticket->fresh()->load('employee:id,name'), null);

        $this->line("  {$ticket->ticket_number} is already with the final authority");
    }

    /** Closes resolved tickets the employee never came back to. */
    private function closeLongResolved(bool $dryRun): int
    {
        $days = HelpdeskSettings::int('helpdesk.auto_close_resolved_days');

        if ($days <= 0) {
            return 0; // Disabled, which is the default.
        }

        $tickets = Ticket::query()
            ->where('status', Ticket::STATUS_RESOLVED)
            ->whereNotNull('resolved_at')
            ->where('resolved_at', '<', now()->subDays($days))
            ->cursor();

        $count = 0;

        foreach ($tickets as $ticket) {
            $count++;

            if ($dryRun) {
                $this->line("  would close {$ticket->ticket_number}");

                continue;
            }

            DB::transaction(function () use ($ticket, $days) {
                $ticket->forceFill([
                    'status' => Ticket::STATUS_CLOSED,
                    'closed_at' => now(),
                    'last_activity_at' => now(),
                ])->save();

                TicketActivityLog::create([
                    'ticket_id' => $ticket->id,
                    'action' => 'STATUS_CHANGED',
                    'performed_by' => null,
                    'old_status' => Ticket::STATUS_RESOLVED,
                    'new_status' => Ticket::STATUS_CLOSED,
                    'remarks' => "Automatically closed after {$days} day(s) with no response.",
                    'created_at' => now(),
                ]);
            });

            TicketNotifier::statusChanged(
                $ticket->fresh()->load('employee:id,name'),
                Ticket::STATUS_RESOLVED,
                Ticket::STATUS_CLOSED,
                null
            );
        }

        return $count;
    }
}
