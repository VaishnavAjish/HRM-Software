<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * financial_allocation_lines — target lines for allocation rules (02.05).
 */
class FinancialAllocationLine extends Model
{
    protected $fillable = [
        'allocation_rule_id',
        'target_financial_organization_id',
        'percentage',
        'basis',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'percentage' => 'decimal:2',
            'is_active' => 'boolean',
        ];
    }

    public function allocationRule()
    {
        return $this->belongsTo(FinancialAllocationRule::class, 'allocation_rule_id');
    }

    public function targetFinancialOrganization()
    {
        return $this->belongsTo(FinancialOrganization::class, 'target_financial_organization_id');
    }
}
