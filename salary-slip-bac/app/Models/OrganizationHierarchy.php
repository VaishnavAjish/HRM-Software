<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_hierarchies — named, effective-dated hierarchy definitions (02.06).
 *
 * Types: enterprise, legal_entity, business_unit, division, department,
 * location, cost_center, functional, project, matrix, dotted_line.
 */
class OrganizationHierarchy extends Model
{
    public const TYPES = [
        'enterprise', 'legal_entity', 'business_unit', 'division', 'department',
        'location', 'cost_center', 'functional', 'project', 'matrix', 'dotted_line',
    ];

    public const STATUSES = ['draft', 'active', 'inactive', 'archived'];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'code',
        'name',
        'type',
        'status',
        'description',
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

    public function nodes()
    {
        return $this->hasMany(OrganizationHierarchyNode::class, 'hierarchy_id');
    }

    public function edges()
    {
        return $this->hasMany(OrganizationHierarchyEdge::class, 'hierarchy_id');
    }
}
