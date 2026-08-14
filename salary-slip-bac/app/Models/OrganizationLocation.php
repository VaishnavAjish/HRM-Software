<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_locations — physical locations with enterprise scope (02.04).
 *
 * Extends the legacy `locations` table with location types, geographic zones,
 * regions, territories and effective dating. `kind` classifies it (branch,
 * office, plant, factory, warehouse, store, worksite, remote); zone/region/
 * territory reference other rows of this table.
 */
class OrganizationLocation extends Model
{
    public const KINDS = ['branch', 'office', 'plant', 'factory', 'warehouse', 'store', 'worksite', 'remote'];

    public const STATUSES = ['active', 'inactive', 'closed'];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'location_type_id',
        'parent_id',
        'code',
        'name',
        'kind',
        'status',
        'address',
        'city',
        'state',
        'country_code',
        'postal_code',
        'timezone',
        'latitude',
        'longitude',
        'contact_email',
        'contact_phone',
        'zone_id',
        'region_id',
        'territory_id',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
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

    public function locationType()
    {
        return $this->belongsTo(OrganizationLocationType::class, 'location_type_id');
    }

    public function parent()
    {
        return $this->belongsTo(self::class, 'parent_id');
    }

    public function children()
    {
        return $this->hasMany(self::class, 'parent_id');
    }

    public function mappings()
    {
        return $this->hasMany(OrganizationWorkLocationMapping::class);
    }

    public function workLocationMappings()
    {
        return $this->hasMany(OrganizationWorkLocationMapping::class, 'organization_location_id');
    }

    public function zone()
    {
        return $this->belongsTo(self::class, 'zone_id');
    }

    public function region()
    {
        return $this->belongsTo(self::class, 'region_id');
    }

    public function territory()
    {
        return $this->belongsTo(self::class, 'territory_id');
    }
}
