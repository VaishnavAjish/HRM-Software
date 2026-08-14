<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_positions — positions within organization units (02.03).
 *
 * Each position carries an approved headcount; employees are assigned through
 * employee_organization_assignments. `reports_to_position_id` builds the
 * position-level chain (02.08 org chart).
 */
class OrganizationPosition extends Model
{
    public const STATUSES = ['active', 'inactive', 'frozen'];

    protected $fillable = [
        'organization_unit_id',
        'code',
        'title',
        'description',
        'approved_headcount',
        'current_headcount',
        'status',
        'reports_to_position_id',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'approved_headcount' => 'integer',
            'current_headcount' => 'integer',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function organizationUnit()
    {
        return $this->belongsTo(OrganizationUnit::class, 'organization_unit_id');
    }

    public function reportsTo()
    {
        return $this->belongsTo(self::class, 'reports_to_position_id');
    }

    public function assignments()
    {
        return $this->hasMany(EmployeeOrganizationAssignment::class);
    }
}
