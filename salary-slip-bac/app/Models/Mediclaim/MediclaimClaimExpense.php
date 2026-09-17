<?php

namespace App\Models\Mediclaim;

use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_claim_expenses — Section E line items by category. The
 * client's running total is UX-only; ClaimWorkflowService::submit()
 * recalculates `mediclaim_claims.total_claimed_amount` from these rows
 * server-side and never trusts a client-supplied total.
 */
class MediclaimClaimExpense extends Model
{
    /**
     * Must match the frontend's `EXPENSE_CATEGORY` keys
     * (`src/features/mediclaim/models/expenseCategories.js`) verbatim — both
     * sides derive this 6-row set from the paper claim form's Section E
     * table ("DETAILS OF CLAIM AMOUNT") independently, and
     * `ValidatesClaimPayload::claimRules()` rejects anything else via
     * `Rule::in`. Previously drifted (`'consultation'`/`'medicine'`/...),
     * which made every claim save fail with "the selected expenses.0.category
     * is invalid" the moment a real expense line was submitted.
     */
    public const CATEGORIES = [
        'CONSULTATION_FEES', 'HOSPITAL_CHARGES', 'MEDICINES', 'DIAGNOSTIC_TESTS', 'SURGERY_PROCEDURE', 'OTHER_EXPENSES',
    ];

    public const CATEGORY_LABELS = [
        'CONSULTATION_FEES' => 'Consultation Fees',
        'HOSPITAL_CHARGES' => 'Hospital Charges',
        'MEDICINES' => 'Medicines',
        'DIAGNOSTIC_TESTS' => 'Diagnostic Tests',
        'SURGERY_PROCEDURE' => 'Surgery / Procedure',
        'OTHER_EXPENSES' => 'Other Expenses',
    ];

    protected $fillable = [
        'claim_id',
        'category',
        'description',
        'claimed_amount',
        'approved_amount',
        'disallowed_amount',
        'disallowed_reason',
        'expense_date',
    ];

    protected function casts(): array
    {
        return [
            'claimed_amount' => 'decimal:2',
            'approved_amount' => 'decimal:2',
            'disallowed_amount' => 'decimal:2',
            'expense_date' => 'date',
        ];
    }

    public function claim()
    {
        return $this->belongsTo(MediclaimClaim::class, 'claim_id');
    }
}
