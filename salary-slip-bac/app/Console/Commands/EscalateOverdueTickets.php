<?php

namespace App\Console\Commands;

use App\Models\Ticket;
use App\Models\TicketActivityLog;
use App\Models\TicketSlaRule;
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
     * and nothing has happened to it for escalate_after_hours.
     *
     * "Nothing has happened" is last_activity_at, not created_at: a ticket being
     * actively discussed is being attended to, even if it is still open.
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
                ->where('status', '!=', Ticket::STATUS_ESCALATED)
                ->where('priority', $rule->priority)
                ->whereRaw('COALESCE(last_activity_at, created_at) < ?', [$cutoff])
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

    private function escalate(Ticket $ticket): void
    {
        $old = $ticket->status;

        DB::transaction(function () use ($ticket, $old) {
            $ticket->forceFill([
                'status' => Ticket::STATUS_ESCALATED,
                'escalation_level' => (int) $ticket->escalation_level + 1,
                'escalated_at' => now(),
                'last_activity_at' => now(),
            ])->save();

            TicketActivityLog::create([
                'ticket_id' => $ticket->id,
                'action' => 'ESCALATED',
                // No performer: this was the scheduler, not a person. A user id
                // here would attribute an automatic action to whoever ran it.
                'performed_by' => null,
                'old_status' => $old,
                'new_status' => Ticket::STATUS_ESCALATED,
                'remarks' => 'Automatically escalated: no activity within the SLA escalation window.',
                'created_at' => now(),
            ]);
        });

        TicketNotifier::escalated($ticket->fresh()->load('employee:id,name'), null);

        $this->line("  escalated {$ticket->ticket_number} to level {$ticket->escalation_level}");
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
