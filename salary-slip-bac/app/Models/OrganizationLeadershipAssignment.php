<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_leadership_assignments — effective-dated leadership roles (02.07).
 *
 * Department Head, Business Unit Head, HR Business Partner. Skip-level manager
 * is derived from the active primary reporting chain.
 */
class OrganizationLeadershipAssignment extends Model
{
    public const LEADERSHIP_TYPES = ['department_head', 'business_unit_head', 'hr_business_partner'];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'user_id',
        'leadership_type',
        'scope_id',
        'scope_type',
        'effective_from',
        'effective_to',
        'is_active',
        'notes',
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

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
