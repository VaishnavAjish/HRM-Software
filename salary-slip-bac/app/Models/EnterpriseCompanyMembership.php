<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * enterprise_company_memberships — which companies belong to which enterprise (02.01).
 *
 * A company belongs to at most one enterprise; ownership percentage tracks the
 * enterprise's stake. Effective-dated so restructures can be scheduled.
 */
class EnterpriseCompanyMembership extends Model
{
    protected $fillable = [
        'enterprise_id',
        'company_id',
        'ownership_percentage',
        'effective_from',
        'effective_to',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'ownership_percentage' => 'decimal:2',
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
}
