<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * mediclaim_claims — the claim itself. `status` is the 16-value workflow
 * state driven by ClaimWorkflowService (see class docblock there for the
 * full transition table); `assigned_manager_id` is a point-in-time snapshot
 * of the employee's manager taken at submission (via the existing upward
 * ReportingHierarchy::managerFor()), not a live lookup, so a later
 * reporting-line change can't retarget who is deciding an in-flight claim.
 * `employee_snapshot`/`patient_snapshot` freeze employee/patient details at
 * submission time so a later profile edit can't rewrite claim history.
 * `submission_idempotency_key` makes a double-submit (double-click, retried
 * request) a no-op instead of a duplicate claim.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('mediclaim_claims')) {
            Schema::create('mediclaim_claims', function (Blueprint $table) {
                $table->id();
                $table->string('claim_number')->nullable()->unique();
                $table->string('company_code');
                $table->foreignId('employee_user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('member_id')->nullable()->constrained('mediclaim_members')->nullOnDelete();
                $table->foreignId('enrollment_id')->nullable()->constrained('mediclaim_enrollments')->nullOnDelete();
                $table->foreignId('policy_version_id')->nullable()->constrained('mediclaim_policy_versions')->nullOnDelete();
                $table->foreignId('hospital_id')->nullable()->constrained('mediclaim_hospitals')->nullOnDelete();
                $table->foreignId('assigned_manager_id')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('intimation_id')->nullable()->constrained('mediclaim_intimations')->nullOnDelete();

                // DRAFT, SUBMITTED, MANAGER_REVIEW, COORDINATOR_VERIFICATION,
                // COMMITTEE_RECOMMENDATION, HR_ELIGIBILITY_VERIFICATION,
                // DIRECTOR_FINAL_APPROVAL, APPROVED, PARTIALLY_APPROVED,
                // REJECTED, SETTLEMENT_PENDING, SETTLED, CLOSED,
                // RETURNED_FOR_CORRECTION, WITHDRAWN, CANCELLED
                $table->string('status')->default('DRAFT');
                $table->unsignedInteger('current_revision')->default(1);

                $table->json('employee_snapshot')->nullable();
                $table->json('patient_snapshot')->nullable();

                // Section C — medical history
                $table->string('nature_of_illness')->nullable();
                $table->date('first_symptom_date')->nullable();
                $table->json('initial_symptoms')->nullable();
                $table->date('first_consultation_date')->nullable();
                $table->string('treating_doctor_name')->nullable();
                $table->boolean('is_medico_legal_case')->default(false);
                // Only meaningful when is_medico_legal_case is true — the PDF's
                // Section C cascades a plain Yes/No here, not free text.
                $table->boolean('reported_to_police')->nullable();
                $table->text('police_station_details')->nullable();

                // Section D — treatment. Options per the actual PDF form:
                // opd, hospitalization, surgery, emergency, tests_only.
                $table->string('treatment_type')->nullable();
                $table->boolean('is_network_hospital')->default(true);
                // Set when the claim used a hospital outside mediclaim_hospitals
                // entirely (hospital_id stays null in that case).
                $table->string('non_network_hospital_name')->nullable();
                $table->text('non_network_reason')->nullable();
                // The PDF asks for admission/discharge date *and time*, not date only.
                $table->dateTime('admission_at')->nullable();
                $table->dateTime('discharge_at')->nullable();
                $table->boolean('is_ongoing_treatment')->default(false);
                $table->text('treatment_description')->nullable();

                // Section E — expense totals (server-authoritative, recalculated on submit)
                $table->decimal('total_claimed_amount', 12, 2)->default(0);
                $table->decimal('total_approved_amount', 12, 2)->nullable();
                $table->decimal('total_disallowed_amount', 12, 2)->nullable();

                // Section G — declaration
                $table->boolean('declaration_accepted')->default(false);
                $table->string('declaration_version')->nullable();
                $table->timestamp('declaration_accepted_at')->nullable();
                $table->string('declaration_ip')->nullable();
                $table->text('declaration_user_agent')->nullable();

                // Set once the Section A-K claim-form PDF has been generated (dompdf, phase B6).
                $table->foreignId('final_form_document_id')->nullable()->constrained('documents')->nullOnDelete();

                $table->string('submission_idempotency_key')->nullable()->unique();
                $table->timestamp('submitted_at')->nullable();
                $table->timestamp('withdrawn_at')->nullable();
                $table->timestamp('cancelled_at')->nullable();
                $table->timestamp('settled_at')->nullable();
                $table->timestamp('closed_at')->nullable();

                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['company_code', 'status'], 'mc_claims_company_status_idx');
                $table->index(['assigned_manager_id', 'status'], 'mc_claims_manager_status_idx');
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('mediclaim_claims');
    }
};
