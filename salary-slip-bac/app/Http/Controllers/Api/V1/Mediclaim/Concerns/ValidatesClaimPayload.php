<?php

namespace App\Http\Controllers\Api\V1\Mediclaim\Concerns;

use App\Models\Mediclaim\MediclaimClaim;
use App\Models\Mediclaim\MediclaimClaimExpense;
use Illuminate\Validation\Rule;

/**
 * Validation rules for the employee-editable claim fields — an exact mirror
 * of `ClaimWorkflowService::EDITABLE_FIELDS`, kept in this one place so
 * `MyClaimController@store` and `ClaimController@update` cannot drift apart.
 *
 * Deliberately absent: `total_claimed_amount`, `total_approved_amount`,
 * `total_disallowed_amount`, `status`, `claim_number`, `assigned_manager_id`,
 * `enrollment_id`, `policy_version_id`, `employee_snapshot`/`patient_snapshot`
 * — every workflow-controlled/derived field `ClaimWorkflowService` already
 * refuses to let `fill()` touch. In particular, the claim total is NEVER a
 * validated/acceptable input here: `ClaimWorkflowService::submit()`
 * recalculates it server-side from `mediclaim_claim_expenses` on every
 * submission, so no client-supplied total could survive past submit even if
 * one were accepted at draft time.
 */
trait ValidatesClaimPayload
{
    protected function claimRules(): array
    {
        return [
            'member_id' => ['sometimes', 'nullable', 'integer', 'exists:mediclaim_members,id'],
            'hospital_id' => ['sometimes', 'nullable', 'integer', 'exists:mediclaim_hospitals,id'],
            'intimation_id' => ['sometimes', 'nullable', 'integer', 'exists:mediclaim_intimations,id'],
            'nature_of_illness' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'first_symptom_date' => ['sometimes', 'nullable', 'date'],
            'initial_symptoms' => ['sometimes', 'nullable', 'array'],
            'initial_symptoms.*' => ['string', 'max:100'],
            'first_consultation_date' => ['sometimes', 'nullable', 'date'],
            'treating_doctor_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'is_medico_legal_case' => ['sometimes', 'boolean'],
            'reported_to_police' => ['sometimes', 'boolean'],
            'police_station_details' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'treatment_type' => ['sometimes', 'nullable', Rule::in(MediclaimClaim::TREATMENT_TYPES)],
            'is_network_hospital' => ['sometimes', 'boolean'],
            'non_network_hospital_name' => ['sometimes', 'nullable', 'string', 'max:255'],
            'non_network_reason' => ['sometimes', 'nullable', 'string', 'max:1000'],
            'admission_at' => ['sometimes', 'nullable', 'date'],
            'discharge_at' => ['sometimes', 'nullable', 'date', 'after_or_equal:admission_at'],
            'is_ongoing_treatment' => ['sometimes', 'boolean'],
            'treatment_description' => ['sometimes', 'nullable', 'string', 'max:4000'],
            'declaration_accepted' => ['sometimes', 'boolean'],
            'declaration_version' => ['sometimes', 'nullable', 'string', 'max:40'],
            'company_code' => ['sometimes', 'nullable', 'string', 'max:60'],

            // Section E — replaced wholesale by ClaimWorkflowService::syncExpenses();
            // 'claimed_amount' is the employee's own line-item figure, still never
            // the source of truth for the claim total once submitted.
            'expenses' => ['sometimes', 'array'],
            'expenses.*.category' => ['required_with:expenses', Rule::in(MediclaimClaimExpense::CATEGORIES)],
            'expenses.*.description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'expenses.*.claimed_amount' => ['required_with:expenses', 'numeric', 'min:0'],
            'expenses.*.expense_date' => ['sometimes', 'nullable', 'date'],
        ];
    }
}
