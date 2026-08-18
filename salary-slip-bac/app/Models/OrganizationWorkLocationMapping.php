<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_work_location_mappings — effective-dated work location assignments (02.04).
 *
 * Maps organization units, positions and employees to physical locations.
 */
class OrganizationWorkLocationMapping extends Model
{
    public const MAPPING_TYPES = ['unit', 'position', 'employee'];

    protected $fillable = [
        'organization_location_id',
        'organization_unit_id',
        'position_id',
        'user_id',
        'mapping_type',
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

    public function organizationLocation()
    {
        return $this->belongsTo(OrganizationLocation::class, 'organization_location_id');
    }

    public function organizationUnit()
    {
        return $this->belongsTo(OrganizationUnit::class, 'organization_unit_id');
    }

    public function position()
    {
        return $this->belongsTo(OrganizationPosition::class, 'position_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
