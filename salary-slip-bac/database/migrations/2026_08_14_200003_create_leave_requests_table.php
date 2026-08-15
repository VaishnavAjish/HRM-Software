<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('leave_requests', function (Blueprint $table) {
            $table->id();
            $table->string('request_number', 32)->unique(); // e.g., LR-2024-000123
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete(); // employee requesting leave
            $table->foreignId('leave_type_id')->constrained('leave_types')->cascadeOnDelete();
            $table->foreignId('leave_policy_id')->nullable()->constrained('leave_policies')->nullOnDelete();
            $table->foreignId('leave_balance_id')->nullable()->constrained('leave_balances')->nullOnDelete();
            $table->date('start_date');
            $table->date('end_date');
            $table->decimal('total_days', 6, 2); // including half days
            $table->boolean('is_half_day_start')->default(false);
            $table->boolean('is_half_day_end')->default(false);
            $table->time('half_day_start_time')->nullable(); // for half day start
            $table->time('half_day_end_time')->nullable(); // for half day end
            $table->string('reason', 1000);
            $table->json('supporting_documents')->nullable(); // file paths
            $table->string('contact_during_leave', 255)->nullable(); // phone/email
            $table->string('emergency_contact', 255)->nullable();
            $table->string('handover_notes', 2000)->nullable();
            $table->string('status', 32)->default('draft'); // draft, submitted, pending, approved, rejected, cancelled, withdrawn
            $table->string('workflow_stage', 32)->nullable(); // current approval stage
            $table->json('approval_chain')->nullable(); // configured approvers
            $table->json('approval_history')->nullable(); // audit trail
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->string('rejection_reason', 1000)->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancellation_reason', 1000)->nullable();
            $table->foreignId('withdrawn_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('withdrawn_at')->nullable();
            $table->boolean('is_emergency')->default(false);
            $table->boolean('auto_approve')->default(false);
            $table->json('metadata')->nullable(); // extensible
            $table->timestamps();
            $table->softDeletes();

            $table->index(['user_id', 'status', 'start_date']);
            $table->index(['leave_type_id', 'status', 'start_date']);
            $table->index(['leave_policy_id', 'status']);
            $table->index(['status', 'workflow_stage']);
            $table->index(['submitted_at', 'status']);
            $table->index(['start_date', 'end_date', 'status']);
            $table->index('request_number');
        });

        Schema::create('leave_approvals', function (Blueprint $table) {
            $table->id();
            $table->foreignId('leave_request_id')->constrained('leave_requests')->cascadeOnDelete();
            $table->integer('stage')->default(1);
            $table->integer('sequence')->default(1);
            $table->foreignId('approver_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('approver_role', 64)->nullable(); // role at time of approval
            $table->string('status', 32)->default('pending'); // pending, approved, rejected, delegated, escalated
            $table->text('comments')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->foreignId('delegated_to')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('delegated_at')->nullable();
            $table->string('delegation_reason', 500)->nullable();
            $table->boolean('is_mandatory')->default(true);
            $table->boolean('can_skip')->default(false);
            $table->json('conditions')->nullable(); // approval conditions
            $table->timestamps();

            $table->index(['leave_request_id', 'stage', 'sequence']);
            $table->index(['approver_id', 'status']);
            $table->index(['status', 'stage']);
        });

        Schema::create('leave_delegations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete(); // delegator
            $table->foreignId('delegate_id')->constrained('users')->cascadeOnDelete(); // delegate
            $table->foreignId('leave_type_id')->nullable()->constrained('leave_types')->nullOnDelete(); // specific type or all
            $table->foreignId('leave_policy_id')->nullable()->constrained('leave_policies')->nullOnDelete();
            $table->date('start_date');
            $table->date('end_date');
            $table->string('reason', 500)->nullable();
            $table->string('status', 32)->default('active'); // active, expired, revoked
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'delegate_id', 'status', 'start_date', 'end_date']);
            $table->index(['delegate_id', 'status', 'start_date', 'end_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('leave_delegations');
        Schema::dropIfExists('leave_approvals');
        Schema::dropIfExists('leave_requests');
    }
};