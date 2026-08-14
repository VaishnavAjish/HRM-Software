<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * organization_change_requests — change requests for organization restructure (DOMAIN 02.09).
 *
 * Workflow: DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → SCHEDULED → APPLIED
 * Terminal: REJECTED, CANCELLED, FAILED
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('organization_change_requests')) {
            return;
        }

        Schema::create('organization_change_requests', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('enterprise_id')->nullable();
            $table->unsignedBigInteger('company_id')->nullable();
            $table->string('code', 60);
            $table->string('name', 190);
            $table->string('description', 500)->nullable();
            $table->string('change_type', 40); // restructure, department_create, department_merge, department_split, department_closure, branch_closure, location_closure, cost_center_change, manager_reassignment, mass_movement, effective_dated_change
            $table->string('status', 30)->default('draft'); // draft, submitted, pending_approval, approved, scheduled, applied, rejected, cancelled, failed
            $table->unsignedBigInteger('requested_by');
            $table->unsignedBigInteger('organization_owner_approver_id')->nullable();
            $table->unsignedBigInteger('hr_approver_id')->nullable();
            $table->date('requested_at')->nullable();
            $table->date('submitted_at')->nullable();
            $table->date('approved_at')->nullable();
            $table->date('scheduled_at')->nullable();
            $table->date('applied_at')->nullable();
            $table->date('rejected_at')->nullable();
            $table->date('cancelled_at')->nullable();
            $table->text('rejection_reason')->nullable();
            $table->json('before_snapshot')->nullable();
            $table->json('after_snapshot')->nullable();
            $table->timestamps();

            $table->unique(['enterprise_id', 'company_id', 'code']);
            $table->index('enterprise_id');
            $table->index('company_id');
            $table->index('change_type');
            $table->index('status');
            $table->index('requested_by');
            $table->index('organization_owner_approver_id');
            $table->index('hr_approver_id');

            $table->foreign('enterprise_id')->references('id')->on('enterprises')->nullOnDelete();
            $table->foreign('company_id')->references('id')->on('companies')->nullOnDelete();
            $table->foreign('requested_by')->references('id')->on('users')->cascadeOnDelete();
            $table->foreign('organization_owner_approver_id')->references('id')->on('users')->nullOnDelete();
            $table->foreign('hr_approver_id')->references('id')->on('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('organization_change_requests');
    }
};