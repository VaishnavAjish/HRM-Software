<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_location_types — configurable location types (02.04).
 *
 * Branch, office, plant, factory, warehouse, store, worksite, remote, zone,
 * region, territory — a configurable catalogue the org-location screen offers.
 */
class OrganizationLocationType extends Model
{
    protected $fillable = [
        'code',
        'name',
        'description',
        'is_active',
        'sort_order',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'sort_order' => 'integer',
        ];
    }

    public function locations()
    {
        return $this->hasMany(OrganizationLocation::class);
    }
}
