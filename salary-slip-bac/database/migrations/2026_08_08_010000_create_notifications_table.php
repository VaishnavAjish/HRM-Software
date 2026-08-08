<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * In-app notifications.
 *
 * One row per recipient, not one per event. A ticket raised in a company with
 * four admins writes four rows, because read state is personal: the whole point
 * is that one admin marking it read does not clear it from everyone else's bell.
 *
 * Until now the notification drawer was seeded from a constant in
 * NotificationContext and "sent" by pushing into React state, so a notification
 * raised in the employee's browser existed only in that tab — the admin it was
 * meant for could never see it. This table is what makes delivery real.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            $table->string('title');
            $table->text('description')->nullable();
            // Drives the drawer's category chips (Tickets, Payroll, Leave, ...).
            $table->string('module')->default('System');
            $table->string('priority')->default('Normal'); // Normal, Urgent, Critical

            $table->string('action_url')->nullable();
            $table->string('action_label')->nullable();

            // Denormalised on purpose: a notification is a record of what was
            // true when it fired. Joining live rows would rewrite history when
            // the ticket is later reassigned or the employee changes department.
            $table->string('triggered_by')->nullable();
            $table->string('related_employee')->nullable();
            $table->string('department')->nullable();

            $table->string('related_type')->nullable(); // e.g. 'ticket'
            $table->unsignedBigInteger('related_id')->nullable();

            $table->timestamp('read_at')->nullable();
            $table->timestamps();

            // The bell asks "my unread, newest first" on every poll.
            $table->index(['user_id', 'read_at']);
            $table->index(['user_id', 'created_at']);
            $table->index(['related_type', 'related_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
