<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_hierarchy_edges — edges between hierarchy nodes (02.06).
 *
 * Supports multiple parents only for Matrix and Dotted-Line hierarchies. The
 * service validates no self-parenting, no cycles, and no duplicate active edges.
 */
class OrganizationHierarchyEdge extends Model
{
    public const EDGE_TYPES = ['primary', 'secondary', 'dotted', 'matrix'];

    protected $fillable = [
        'hierarchy_id',
        'parent_node_id',
        'child_node_id',
        'edge_type',
        'is_active',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function hierarchy()
    {
        return $this->belongsTo(OrganizationHierarchy::class, 'hierarchy_id');
    }

    public function parentNode()
    {
        return $this->belongsTo(OrganizationHierarchyNode::class, 'parent_node_id');
    }

    public function childNode()
    {
        return $this->belongsTo(OrganizationHierarchyNode::class, 'child_node_id');
    }
}
