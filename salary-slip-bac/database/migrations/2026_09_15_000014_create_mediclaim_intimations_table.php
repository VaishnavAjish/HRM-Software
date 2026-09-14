<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_intimations — office-notify records for planned/emergency
 * treatment, each with an atomically-allocated `reference_number`
 * (MediclaimIntimationNumber). `linked_claim_id` is added by the
 * follow-up alter migration once `mediclaim_claims` exists.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_intimations')) {
            Schema::create('mediclaim_intimations', function (Blueprint $table) {
                $table->id();
                $table->foreignId('employee_user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('member_id')->nullable()->constrained('mediclaim_members')->nullOnDelete();
                $table->foreignId('hospital_id')->nullable()->constrained('mediclaim_hospitals')->nullOnDelete();
                $table->string('company_code')->nullable();
                $table->string('reference_number')->unique();
                $table->string('treating_doctor')->nullable();
                $table->text('planned_treatment')->nullable();
                $table->decimal('estimated_amount', 12, 2)->nullable();
                $table->text('employee_remarks')->nullable();
                $table->boolean('is_emergency')->default(false);
                $table->text('emergency_explanation')->nullable();
                // When the office was actually notified (may differ from created_at
                // for an emergency, where the PDF requires the *actual* notify time).
                $table->dateTime('notified_at')->nullable();
                $table->foreignId('notified_by')->nullable()->constrained('users')->nullOnDelete();
                $table->date('expected_admission_date')->nullable();
                $table->string('status')->default('recorded'); // recorded, linked, closed
                $table->timestamps();

                $table->index('employee_user_id');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_intimations');
    }
};
