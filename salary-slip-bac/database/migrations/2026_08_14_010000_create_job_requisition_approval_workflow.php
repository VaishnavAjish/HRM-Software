<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('job_requisitions', function (Blueprint $table) {
            $table->foreignId('hiring_manager_id')->nullable()->after('department_manager_id')
                ->constrained('users')->nullOnDelete();
            $table->foreignId('director_id')->nullable()->after('hiring_manager_id')
                ->constrained('users')->nullOnDelete();
        });

        Schema::create('job_requisition_approval_cycles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('job_requisition_id')->constrained('job_requisitions')->cascadeOnDelete();
            $table->unsignedInteger('cycle_number');
            $table->string('status')->default('PENDING');
            $table->json('snapshot');
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at');
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();

            $table->unique(['job_requisition_id', 'cycle_number'], 'job_req_approval_cycle_unique');
            $table->index(['job_requisition_id', 'status'], 'job_req_approval_cycle_status_idx');
        });

        Schema::create('job_requisition_approval_steps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('approval_cycle_id')->constrained('job_requisition_approval_cycles')->cascadeOnDelete();
            $table->unsignedSmallInteger('step_order');
            $table->string('step_type');
            $table->foreignId('assigned_to')->nullable()->constrained('users')->nullOnDelete();
            $table->string('status')->default('WAITING');
            $table->text('comment')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->timestamps();

            $table->unique(['approval_cycle_id', 'step_order'], 'job_req_approval_step_unique');
            $table->index(['assigned_to', 'step_type', 'status'], 'job_req_approval_assignee_idx');
        });

        Schema::table('job_requisitions', function (Blueprint $table) {
            $table->foreignId('current_approval_cycle_id')->nullable()->after('director_id')
                ->constrained('job_requisition_approval_cycles')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('job_requisitions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('current_approval_cycle_id');
        });

        Schema::dropIfExists('job_requisition_approval_steps');
        Schema::dropIfExists('job_requisition_approval_cycles');

        Schema::table('job_requisitions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('director_id');
            $table->dropConstrainedForeignId('hiring_manager_id');
        });
    }
};
