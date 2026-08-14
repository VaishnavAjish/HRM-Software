<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_units — the normalized business structure (02.03).
 *
 * A unit can be a Business Unit, Division, Function, Department,
 * Sub-Department, Section, Team, Project Organization, Virtual Organization or
 * Shared Service Organization; `type` classifies it. Units nest under a parent
 * within the same enterprise/company, with cycle prevention in the service.
 */
class OrganizationUnit extends Model
{
    public const TYPES = [
        'business_unit', 'division', 'function', 'department', 'sub_department',
        'section', 'team', 'project_org', 'virtual_org', 'shared_service_org',
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
        'owner_user_id',
        'legacy_department_id',
        'legacy_unit_id',
        'legacy_branch_id',
        'legacy_designation_id',
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

    public function positions()
    {
        return $this->hasMany(OrganizationPosition::class);
    }

    public function manager()
    {
        return $this->belongsTo(User::class, 'manager_user_id');
    }

    public function owner()
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function assignments()
    {
        return $this->hasMany(EmployeeOrganizationAssignment::class, 'organization_unit_id');
    }
}
