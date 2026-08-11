<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Who reports to whom.
 *
 * A table rather than a `reporting_manager_id` column on users, for three
 * reasons that matter to ticketing:
 *
 *  · A ticket must keep the routing it was created under even after the
 *    employee's manager changes. Effective dating means the chain that was in
 *    force on any past date is still answerable.
 *  · Reassignments are an audit subject in their own right — who changed a
 *    reporting line, when, and why.
 *  · It leaves room for non-primary lines (dotted-line/interim managers)
 *    without a second column and a pile of conditionals.
 *
 * `users.manager_name` already exists but is free text typed into the employee
 * form. It is a label, not a relationship: it cannot be joined, validated, or
 * walked upward, so it is left alone rather than migrated.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('reporting_relationships', function (Blueprint $table) {
            $table->id();
            $table->foreignId('employee_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('manager_user_id')->constrained('users')->cascadeOnDelete();

            // 'primary' is the escalation line. Others are advisory and are
            // never walked by the escalation engine.
            $table->string('relationship_type', 24)->default('primary');
            $table->string('status', 16)->default('active');

            $table->date('effective_from');
            $table->date('effective_to')->nullable();
            $table->text('reason')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['employee_user_id', 'status']);
            $table->index(['manager_user_id', 'status']);
            $table->index(['employee_user_id', 'relationship_type', 'status']);
        });

        /*
         * One active primary manager per employee, enforced by the database.
         *
         * Application checks are necessary but not sufficient: two concurrent
         * requests both pass a "does one already exist" check and both insert.
         * A partial unique index is the only thing that actually holds under
         * concurrency, and a second active manager would make the escalation
         * chain non-deterministic.
         */
        DB::statement("
            CREATE UNIQUE INDEX reporting_relationships_one_active_primary
            ON reporting_relationships (employee_user_id)
            WHERE relationship_type = 'primary' AND status = 'active'
        ");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS reporting_relationships_one_active_primary');
        Schema::dropIfExists('reporting_relationships');
    }
};
