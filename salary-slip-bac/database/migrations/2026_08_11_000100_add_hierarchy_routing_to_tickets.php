<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hierarchy routing, plus the history the escalation engine writes.
 *
 * The snapshot is stored on the ticket rather than re-derived on read: a ticket
 * must keep the routing it was created under even after the employee's manager
 * changes, and a live join would silently rewrite the past.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tickets', function (Blueprint $table) {
            // The chain captured when the ticket was raised: ordered list of
            // {level, user_id, name, role, ...} ending at a Super Admin.
            $table->jsonb('hierarchy_snapshot')->nullable();

            // Who the ticket was first routed to, kept even after reassignment.
            $table->foreignId('routed_to')->nullable()->constrained('users')->nullOnDelete();

            // The assignee displaced by the most recent escalation. The spec
            // calls for preserving them so an escalation can be explained
            // ("was with X, now with Y") without reading the whole history.
            $table->foreignId('previous_assigned_to')->nullable()->constrained('users')->nullOnDelete();

            // When the current authority last did something that counts as
            // action. Distinct from last_activity_at, which any event moves —
            // including the employee's own replies, which must not buy the
            // assignee more time.
            $table->timestamp('authority_action_at')->nullable();

            // Indexes named in the specification that were not already present.
            $table->index('escalation_level');
            $table->index('priority');
            $table->index('department');
            $table->index('unit');
            $table->index(['assigned_to', 'escalation_level']);
        });

        Schema::create('ticket_assignment_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained('tickets')->cascadeOnDelete();
            $table->foreignId('from_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('to_user_id')->nullable()->constrained('users')->nullOnDelete();
            // manual | hierarchy_routing | escalation | bulk | override
            $table->string('method', 32)->default('manual');
            // Null performer means the scheduler did it, not a person.
            $table->foreignId('performed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['ticket_id', 'created_at']);
        });

        Schema::create('ticket_escalation_history', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained('tickets')->cascadeOnDelete();
            $table->unsignedSmallInteger('from_level')->default(0);
            $table->unsignedSmallInteger('to_level');
            $table->foreignId('from_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('to_user_id')->nullable()->constrained('users')->nullOnDelete();
            // sla_inactivity | manual | override
            $table->string('trigger', 32)->default('sla_inactivity');
            $table->foreignId('performed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('reason')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['ticket_id', 'created_at']);
            $table->index('to_level');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ticket_escalation_history');
        Schema::dropIfExists('ticket_assignment_history');

        Schema::table('tickets', function (Blueprint $table) {
            $table->dropIndex(['escalation_level']);
            $table->dropIndex(['priority']);
            $table->dropIndex(['department']);
            $table->dropIndex(['unit']);
            $table->dropIndex(['assigned_to', 'escalation_level']);

            $table->dropConstrainedForeignKey('routed_to');
            $table->dropConstrainedForeignKey('previous_assigned_to');
            $table->dropColumn(['hierarchy_snapshot', 'authority_action_at']);
        });
    }
};
