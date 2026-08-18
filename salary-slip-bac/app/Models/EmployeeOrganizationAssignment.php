<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * employee_organization_assignments — effective-dated employee assignments (02.03).
 *
 * Links employees to organization units and positions, optionally as a
 * secondary / functional / project / matrix assignment. `is_primary` marks the
 * main one; updates keep legacy compatibility fields in sync.
 */
class EmployeeOrganizationAssignment extends Model
{
    public const ASSIGNMENT_TYPES = ['primary', 'secondary', 'functional', 'project', 'matrix'];

    protected $fillable = [
        'user_id',
        'organization_unit_id',
        'position_id',
        'designation_id',
        'location_id',
        'cost_center_id',
        'manager_user_id',
        'assignment_type',
        'is_primary',
        'assignment_percentage',
        'fte',
        'effective_from',
        'effective_to',
        'is_active',
        'notes',
        'change_reason',
    ];

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'assignment_percentage' => 'decimal:2',
            'fte' => 'decimal:2',
            'effective_from' => 'date',
            'effective_to' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function organizationUnit()
    {
        return $this->belongsTo(OrganizationUnit::class, 'organization_unit_id');
    }

    public function position()
    {
        return $this->belongsTo(OrganizationPosition::class, 'position_id');
    }

    public function designation()
    {
        return $this->belongsTo(Designation::class);
    }

    public function location()
    {
        return $this->belongsTo(Location::class);
    }

    public function costCenter()
    {
        return $this->belongsTo(FinancialOrganization::class, 'cost_center_id');
    }

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_user_id');
    }
}
