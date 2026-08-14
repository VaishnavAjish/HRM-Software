<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * legal_entity_addresses — addresses for a legal entity profile (02.02).
 *
 * Multiple addresses per profile with type classification (registered,
 * correspondence, branch, factory, warehouse, other).
 */
class LegalEntityAddress extends Model
{
    protected $fillable = [
        'legal_entity_profile_id',
        'type',
        'address_line_1',
        'address_line_2',
        'city',
        'state',
        'country_code',
        'postal_code',
        'is_primary',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'is_active' => 'boolean',
        ];
    }

    public function legalEntityProfile()
    {
        return $this->belongsTo(LegalEntityProfile::class, 'legal_entity_profile_id');
    }
}
