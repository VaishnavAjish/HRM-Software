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
        Schema::create('compensatory_off', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('leave_type_id')->constrained('leave_types')->cascadeOnDelete(); // CO type
            $table->foreignId('leave_balance_id')->nullable()->constrained('leave_balances')->nullOnDelete();
            $table->date('worked_date'); // date employee worked (holiday/weekend)
            $table->decimal('hours_worked', 6, 2)->default(0);
            $table->decimal('hours_earned', 6, 2)->default(0); // typically 1:1 or 1.5:1
            $table->string('earning_rule', 64)->default('standard'); // standard, time_and_half, double
            $table->string('reason', 500); // why worked on off day
            $table->json('supporting_documents')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->string('status', 32)->default('pending'); // pending, approved, rejected, expired, availed
            $table->date('expiry_date')->nullable(); // when CO expires
            $table->decimal('availed_hours', 6, 2)->default(0);
            $table->json('avail_history')->nullable(); // track when CO was used
            $table->foreignId('leave_request_id')->nullable()->constrained('leave_requests')->nullOnDelete(); // when CO is used via leave request
            $table->timestamps();
            $table->softDeletes();

            $table->index(['user_id', 'status', 'worked_date']);
            $table->index(['user_id', 'expiry_date', 'status']);
            $table->index(['approved_by', 'status']);
        });

        Schema::create('work_from_home_requests', function (Blueprint $table) {
            $table->id();
            $table->string('request_number', 32)->unique(); // WFH-2024-000123
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('leave_type_id')->constrained('leave_types')->cascadeOnDelete(); // WFH type
            $table->foreignId('leave_policy_id')->nullable()->constrained('leave_policies')->nullOnDelete();
            $table->date('start_date');
            $table->date('end_date');
            $table->decimal('total_days', 6, 2);
            $table->boolean('is_recurring')->default(false);
            $table->json('recurrence_pattern')->nullable(); // weekly, specific days
            $table->string('reason', 500);
            $table->string('work_location', 255)->nullable(); // home address
            $table->string('contact_number', 32)->nullable();
            $table->string('emergency_contact', 255)->nullable();
            $table->json('equipment_taken')->nullable(); // laptop, monitor, etc.
            $table->string('status', 32)->default('draft'); // draft, submitted, pending, approved, rejected, cancelled
            $table->string('workflow_stage', 32)->nullable();
            $table->json('approval_chain')->nullable();
            $table->json('approval_history')->nullable();
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
            $table->boolean('requires_check_in')->default(true);
            $table->json('check_in_schedule')->nullable(); // daily check-in times
            $table->json('metadata')->nullable();
            $table->timestamps();
            $table->softDeletes();

            $table->index(['user_id', 'status', 'start_date']);
            $table->index(['status', 'workflow_stage']);
            $table->index(['start_date', 'end_date', 'status']);
        });

        Schema::create('wfh_check_ins', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wfh_request_id')->constrained('work_from_home_requests')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('check_in_date');
            $table->time('check_in_time')->nullable();
            $table->time('check_out_time')->nullable();
            $table->string('status', 32)->default('present'); // present, late, absent
            $table->string('location', 255)->nullable(); // GPS or IP-based
            $table->json('activity_log')->nullable(); // work done
            $table->timestamps();

            $table->unique(['wfh_request_id', 'check_in_date']);
            $table->index(['user_id', 'check_in_date']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('wfh_check_ins');
        Schema::dropIfExists('work_from_home_requests');
        Schema::dropIfExists('compensatory_off');
    }
};