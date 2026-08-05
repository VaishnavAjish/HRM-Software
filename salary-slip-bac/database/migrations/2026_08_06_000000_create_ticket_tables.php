<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Support ticketing.
 *
 * Scoping columns are `company_code` / `unit` / `department` strings rather than
 * the company_id / branch_id / department_id the spec sketches. That is not a
 * simplification: users carry their tenancy as `company_code` (a comma list for
 * multi-company admins) and `unit`, and every existing scope check in the app —
 * AuthorizedUserQuery, ScopeMatcher, AdminController — reads those columns.
 * Integer FKs here would be a second, disagreeing notion of "which company",
 * and a ticket would be invisible to the very admin meant to answer it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ticket_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('description')->nullable();
            // Which team the category routes to once approved. Free text for the
            // same reason as above: departments are strings on users.
            $table->string('default_department')->nullable();
            $table->boolean('is_active')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();

            $table->index(['is_active', 'sort_order']);
        });

        /**
         * One row per period key (the year), holding the last number issued.
         *
         * A counter table rather than max(ticket_number)+1: two employees
         * submitting at the same moment both read the same max and generate the
         * same number, and the unique index then fails one of them with a 500 on
         * a form they filled in correctly. Allocation takes a row lock instead,
         * so the second caller waits and gets the next value.
         */
        Schema::create('ticket_number_counters', function (Blueprint $table) {
            $table->id();
            $table->string('period_key', 16)->unique();
            $table->unsignedBigInteger('current_value')->default(0);
            $table->timestamps();
        });

        Schema::create('tickets', function (Blueprint $table) {
            $table->id();
            $table->string('ticket_number')->unique();
            $table->foreignId('employee_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('category_id')->nullable()->constrained('ticket_categories')->nullOnDelete();

            $table->string('subject');
            $table->text('description');
            $table->string('priority')->default('medium');   // low, medium, high, urgent
            $table->string('status')->default('open');       // see App\Models\Ticket::STATUSES

            // Captured at creation from the raising employee, not joined at read
            // time: an employee can move company/unit/department, and a ticket
            // must stay with the desk that actually owns it.
            $table->string('company_code')->nullable();
            $table->string('unit')->nullable();
            $table->string('department')->nullable();

            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('assigned_at')->nullable();

            $table->timestamp('resolved_at')->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('reopened_at')->nullable();
            // Drives "needs attention" ordering without counting messages per row.
            $table->timestamp('last_activity_at')->nullable();

            $table->timestamps();

            $table->index(['company_code', 'unit', 'status']);
            $table->index(['employee_id', 'status']);
            $table->index(['assigned_to', 'status']);
            $table->index(['status', 'priority']);
            $table->index('created_at');
        });

        Schema::create('ticket_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained('tickets')->cascadeOnDelete();
            $table->foreignId('sender_id')->nullable()->constrained('users')->nullOnDelete();
            $table->text('message');
            // Internal notes are staff-only and never returned to the employee
            // who raised the ticket. Enforced in the controller, not just hidden
            // in the UI.
            $table->boolean('is_internal')->default(false);
            $table->string('attachment_path')->nullable();
            $table->string('attachment_name')->nullable();
            $table->timestamps();

            $table->index(['ticket_id', 'created_at']);
        });

        Schema::create('ticket_attachments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained('tickets')->cascadeOnDelete();
            $table->foreignId('message_id')->nullable()->constrained('ticket_messages')->cascadeOnDelete();
            $table->string('file_name');
            $table->string('file_path');
            $table->string('mime_type')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('ticket_id');
        });

        /**
         * Append-only history. "Ticket history can never be deleted" is a stated
         * business rule, so nothing in the app updates or removes these rows —
         * they carry created_at only.
         */
        Schema::create('ticket_activity_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('ticket_id')->constrained('tickets')->cascadeOnDelete();
            $table->string('action');
            $table->foreignId('performed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('old_status')->nullable();
            $table->string('new_status')->nullable();
            $table->text('remarks')->nullable();
            $table->timestamp('created_at')->nullable();

            $table->index(['ticket_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ticket_activity_logs');
        Schema::dropIfExists('ticket_attachments');
        Schema::dropIfExists('ticket_messages');
        Schema::dropIfExists('tickets');
        Schema::dropIfExists('ticket_number_counters');
        Schema::dropIfExists('ticket_categories');
    }
};
