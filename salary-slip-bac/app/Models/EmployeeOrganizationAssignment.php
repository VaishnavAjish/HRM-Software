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
        'assignment_type',
        'is_primary',
        'effective_from',
        'effective_to',
        'is_active',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
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
        return $this->belongsTo(OrganizationPosition::class);
    }
}
