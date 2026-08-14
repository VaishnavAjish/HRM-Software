<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * An enterprise — the top of the ownership structure (02.01).
 *
 * A group of companies. `enterprise_type` classifies it (standalone, group,
 * holding, parent, subsidiary); `parent_enterprise_id` nests a subsidiary under
 * its parent. The code is the stable identifier and is unique globally.
 */
class Enterprise extends Model
{
    public const TYPES = ['standalone', 'group', 'holding', 'parent', 'subsidiary'];

    protected $fillable = [
        'code',
        'enterprise_type',
        'parent_enterprise_id',
        'name',
        'display_name',
        'registration_number',
        'tax_identification',
        'incorporation_date',
        'country_code',
        'timezone',
        'primary_address',
        'contact_email',
        'contact_phone',
        'fiscal_year_start',
        'currency',
        'logo_document_id',
        'brand_primary_color',
        'brand_secondary_color',
        'is_active',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'incorporation_date' => 'date',
            'is_active' => 'boolean',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function parent()
    {
        return $this->belongsTo(self::class, 'parent_enterprise_id');
    }

    public function children()
    {
        return $this->hasMany(self::class, 'parent_enterprise_id');
    }

    public function memberships()
    {
        return $this->hasMany(EnterpriseCompanyMembership::class);
    }

    public function companies()
    {
        return $this->hasManyThrough(
            Company::class,
            EnterpriseCompanyMembership::class,
            'enterprise_id',
            'id',
            'id',
            'company_id'
        );
    }
}
