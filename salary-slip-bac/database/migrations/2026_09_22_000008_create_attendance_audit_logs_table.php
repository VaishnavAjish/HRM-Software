<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attendance Engine Rebuild — Phase 2.
 *
 * `attendance_audit_logs` — generic audit trail (spec §46) for every
 * attendance-adjacent change that isn't already its own fully-audited
 * record: rule created/changed, punch marked duplicate/undone, attendance
 * manually approved, device registered/edited, etc. (A regularization's own
 * approve/reject trail already lives on `attendance_regularizations` itself
 * and does not need a second copy here.)
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('attendance_audit_logs')) {
            return;
        }

        Schema::create('attendance_audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete(); // the actor
            $table->string('action'); // e.g. RULE_CREATED, RULE_CHANGED, PUNCH_MARKED_DUPLICATE, DEVICE_UPDATED
            $table->string('subject_type')->nullable(); // 'attendance_rule', 'attendance_punch', 'attendance_device', ...
            $table->unsignedBigInteger('subject_id')->nullable();
            $table->jsonb('old_value')->nullable();
            $table->jsonb('new_value')->nullable();
            $table->text('reason')->nullable();
            $table->string('ip_address')->nullable();
            $table->text('user_agent')->nullable();
            $table->jsonb('request_meta')->nullable();
            $table->timestamps();

            $table->index(['subject_type', 'subject_id']);
            $table->index('action');
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_audit_logs');
    }
};
