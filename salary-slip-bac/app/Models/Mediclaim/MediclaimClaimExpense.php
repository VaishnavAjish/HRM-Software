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
    public const CATEGORIES = [
        'consultation', 'medicine', 'diagnostic', 'hospitalization', 'surgery', 'other',
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
