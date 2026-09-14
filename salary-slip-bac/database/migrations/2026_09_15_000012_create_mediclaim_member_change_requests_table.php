<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_member_change_requests — employee-submitted add/update/remove
 * requests against their covered members, HR-decided. `member_id` is null
 * for an add-new-member request. `previous_values` preserves what the
 * member row looked like before an approved change.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_member_change_requests')) {
            Schema::create('mediclaim_member_change_requests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('enrollment_id')->constrained('mediclaim_enrollments')->cascadeOnDelete();
                $table->foreignId('member_id')->nullable()->constrained('mediclaim_members')->nullOnDelete();
                $table->string('request_type'); // add, update, remove
                $table->json('proposed_values');
                $table->json('previous_values')->nullable();
                $table->string('status')->default('pending'); // pending, approved, rejected, cancelled
                $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('decided_at')->nullable();
                $table->text('decision_remarks')->nullable();
                $table->date('effective_from')->nullable();
                $table->timestamps();

                $table->index(['employee_user_id', 'status'], 'mc_member_change_requests_employee_status_idx');
                $table->index(['enrollment_id', 'status'], 'mc_member_change_requests_enrollment_status_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_member_change_requests');
    }
};
