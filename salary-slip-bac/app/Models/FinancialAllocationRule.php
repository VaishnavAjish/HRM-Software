<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * financial_allocation_rules — cost allocation rules (02.05).
 *
 * Effective-dated rules that allocate a source financial organization across
 * target lines. Percentages must total 100 for an active rule.
 */
class FinancialAllocationRule extends Model
{
    public const STATUSES = ['draft', 'active', 'inactive', 'archived'];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'code',
        'name',
        'description',
        'status',
        'source_financial_organization_id',
        'effective_from',
        'effective_to',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'effective_from' => 'date',
            'effective_to' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function enterprise()
    {
        return $this->belongsTo(Enterprise::class);
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function sourceFinancialOrganization()
    {
        return $this->belongsTo(FinancialOrganization::class, 'source_financial_organization_id');
    }

    public function lines()
    {
        return $this->hasMany(FinancialAllocationLine::class, 'allocation_rule_id');
    }
}
