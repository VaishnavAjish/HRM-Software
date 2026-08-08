<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SLA targets and the workflow states the control centre needs.
 *
 * The helpdesk UI was showing an SLA timer, an overdue count and a compliance
 * percentage that no column backed — they were literals in the React component.
 * These are the columns that make those numbers real:
 *
 *   sla_due_at        when resolution is due, stamped at creation from the rule
 *                     for the ticket's priority. Stored rather than derived on
 *                     read so changing a rule later does not silently rewrite
 *                     history — a ticket is judged against the target that was
 *                     in force when it was raised.
 *   first_response_at first staff reply; the response half of an SLA.
 *   sla_breached_at   set when a scheduled check or a read notices the target
 *                     passed while still unresolved. Nullable, not a boolean,
 *                     because "when" is what a report needs.
 *   escalation_level  0 = never escalated. Incremented by an explicit escalate.
 */
return new class extends Migration
{
    private const DEFAULT_RULES = [
        // priority, response_hours, resolution_hours, auto_escalate, escalate_after_hours
        ['urgent', 1, 4, true, 2],
        ['high', 2, 8, true, 4],
        ['medium', 4, 24, true, 12],
        ['low', 8, 48, false, 24],
    ];

    public function up(): void
    {
        Schema::create('ticket_sla_rules', function (Blueprint $table) {
            $table->id();
            $table->string('priority')->unique();
            $table->unsignedSmallInteger('response_hours')->default(4);
            $table->unsignedSmallInteger('resolution_hours')->default(24);
            $table->boolean('auto_escalate')->default(false);
            $table->unsignedSmallInteger('escalate_after_hours')->default(12);
            $table->timestamps();
        });

        Schema::table('tickets', function (Blueprint $table) {
            $table->timestamp('sla_due_at')->nullable();
            $table->timestamp('first_response_at')->nullable();
            $table->timestamp('sla_breached_at')->nullable();
            $table->unsignedSmallInteger('escalation_level')->default(0);
            $table->timestamp('escalated_at')->nullable();

            // Reporting/queue reads filter on these constantly.
            $table->index('sla_due_at');
            $table->index(['status', 'sla_breached_at']);
        });

        $now = now();
        foreach (self::DEFAULT_RULES as [$priority, $response, $resolution, $autoEscalate, $escalateAfter]) {
            DB::table('ticket_sla_rules')->insert([
                'priority' => $priority,
                'response_hours' => $response,
                'resolution_hours' => $resolution,
                'auto_escalate' => $autoEscalate,
                'escalate_after_hours' => $escalateAfter,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        // Backfill: existing tickets predate the SLA columns and would otherwise
        // report as "no target", which reads as a breach in some views.
        foreach (self::DEFAULT_RULES as [$priority, , $resolution]) {
            DB::table('tickets')
                ->where('priority', $priority)
                ->whereNull('sla_due_at')
                ->orderBy('id')
                ->chunkById(100, function ($tickets) use ($resolution) {
                    foreach ($tickets as $ticket) {
                        $dueAt = \Illuminate\Support\Carbon::parse($ticket->created_at)->addHours($resolution);
                        DB::table('tickets')
                            ->where('id', $ticket->id)
                            ->update(['sla_due_at' => $dueAt]);
                    }
                });
        }
    }

    public function down(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            $table->dropIndex(['sla_due_at']);
            $table->dropIndex(['status', 'sla_breached_at']);
            $table->dropColumn([
                'sla_due_at', 'first_response_at', 'sla_breached_at',
                'escalation_level', 'escalated_at',
            ]);
        });

        Schema::dropIfExists('ticket_sla_rules');
    }
};
