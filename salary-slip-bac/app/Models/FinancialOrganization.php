<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * financial_organizations — financial structure (02.05).
 *
 * Cost Centers, Profit Centers, Budget Centers, Payroll Areas, Expense Units,
 * Finance Business Units, Project Cost Codes, Internal Orders. `type`
 * classifies; units nest under a parent within the same enterprise/company.
 */
class FinancialOrganization extends Model
{
    public const TYPES = [
        'cost_center', 'profit_center', 'budget_center', 'payroll_area',
        'expense_unit', 'finance_business_unit', 'project_cost_code', 'internal_order',
    ];

    public const STATUSES = ['active', 'inactive', 'closed'];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'parent_id',
        'code',
        'name',
        'type',
        'status',
        'description',
        'manager_user_id',
        'legacy_cost_center_id',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'effective_from' => 'date',
            'effective_to' => 'date',
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

    public function parent()
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_user_id');
    }

    public function glMappings()
    {
        return $this->hasMany(FinancialGlMapping::class);
    }

    public function allocationRulesAsSource()
    {
        return $this->hasMany(FinancialAllocationRule::class, 'source_financial_organization_id');
    }
}
