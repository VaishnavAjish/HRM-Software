<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Add Domain 03 Job Architecture columns to organization_positions (03.03).
 *
 * Links positions to Jobs, Grades, adds Position Type, Employment Type,
 * Approval workflow, Capacity breakdown (Headcount + FTE).
 */
return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        if (!Schema::hasTable('organization_positions')) {
            return;
        }

        Schema::table('organization_positions', function (Blueprint $table) {
            // Job Architecture links
            $table->unsignedBigInteger('job_id')->nullable()->after('organization_unit_id');
            $table->unsignedBigInteger('grade_id')->nullable()->after('job_id');

            // Position classification
            $table->string('position_type', 20)->default('permanent')->after('status'); // permanent, temporary, shared, seasonal
            $table->string('employment_type', 40)->nullable()->after('position_type'); // full_time, part_time, contract, etc.

            // Capacity breakdown
            $table->decimal('fte_capacity', 5, 2)->default(1.00)->after('current_headcount');
            $table->unsignedInteger('filled_headcount')->default(0)->after('fte_capacity');
            $table->unsignedInteger('vacant_headcount')->default(0)->after('filled_headcount');
            $table->unsignedInteger('reserved_headcount')->default(0)->after('vacant_headcount');

            // Approval workflow
            $table->string('approval_status', 20)->default('draft')->after('reserved_headcount'); // draft, requested, pending_approval, approved, rejected
            $table->timestamp('approved_at')->nullable()->after('approval_status');
            $table->unsignedBigInteger('approved_by')->nullable()->after('approved_at');
            $table->unsignedBigInteger('budget_id')->nullable()->after('approved_by');

            // Indexes
            $table->index('job_id');
            $table->index('grade_id');
            $table->index('position_type');
            $table->index('employment_type');
            $table->index('approval_status');
            $table->index('approved_by');

            // Foreign keys
            $table->foreign('job_id')->references('id')->on('jobs')->nullOnDelete();
            $table->foreign('grade_id')->references('id')->on('job_grades')->nullOnDelete();
            $table->foreign('approved_by')->references('id')->on('users')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        if (!Schema::hasTable('organization_positions')) {
            return;
        }

        Schema::table('organization_positions', function (Blueprint $table) {
            $table->dropForeign(['job_id']);
            $table->dropForeign(['grade_id']);
            $table->dropForeign(['approved_by']);

            $table->dropIndex(['job_id']);
            $table->dropIndex(['grade_id']);
            $table->dropIndex(['position_type']);
            $table->dropIndex(['employment_type']);
            $table->dropIndex(['approval_status']);
            $table->dropIndex(['approved_by']);

            $table->dropColumn([
                'job_id', 'grade_id', 'position_type', 'employment_type',
                'fte_capacity', 'filled_headcount', 'vacant_headcount', 'reserved_headcount',
                'approval_status', 'approved_at', 'approved_by', 'budget_id'
            ]);
        });
    }
};
