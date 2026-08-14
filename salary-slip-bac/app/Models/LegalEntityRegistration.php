<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * legal_entity_registrations — tax and statutory registrations (02.02).
 *
 * Multiple registrations per profile, by type (gst, pan, tan, esi, pf, ...)
 * and jurisdiction.
 */
class LegalEntityRegistration extends Model
{
    protected $fillable = [
        'legal_entity_profile_id',
        'type',
        'jurisdiction',
        'registration_number',
        'registration_date',
        'expiry_date',
        'is_active',
        'notes',
    ];

    protected function casts(): array
    {
        return [
            'registration_date' => 'date',
            'expiry_date' => 'date',
            'is_active' => 'boolean',
        ];
    }

    public function legalEntityProfile()
    {
        return $this->belongsTo(LegalEntityProfile::class, 'legal_entity_profile_id');
    }
}
