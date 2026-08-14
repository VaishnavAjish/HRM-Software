<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_hierarchy_nodes — nodes in a hierarchy (02.06).
 *
 * Each node references a record from the appropriate table based on hierarchy
 * type (enterprise, company, legal_entity, organization_unit,
 * organization_location, financial_organization, position, user).
 */
class OrganizationHierarchyNode extends Model
{
    public const NODE_TYPES = [
        'enterprise', 'company', 'legal_entity', 'organization_unit',
        'organization_location', 'financial_organization', 'position', 'user',
    ];

    protected $fillable = [
        'hierarchy_id',
        'node_type',
        'node_id',
        'code',
        'name',
        'metadata',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'metadata' => 'array',
            'is_active' => 'boolean',
        ];
    }

    public function hierarchy()
    {
        return $this->belongsTo(OrganizationHierarchy::class, 'hierarchy_id');
    }

    public function parentEdges()
    {
        return $this->hasMany(OrganizationHierarchyEdge::class, 'child_node_id');
    }

    public function childEdges()
    {
        return $this->hasMany(OrganizationHierarchyEdge::class, 'parent_node_id');
    }
}
