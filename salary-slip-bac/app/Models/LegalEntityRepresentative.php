<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * legal_entity_representatives — authorized signatories and representatives (02.02).
 *
 * Directors, authorized signatories, company secretaries, compliance officers.
 */
class LegalEntityRepresentative extends Model
{
    public const TYPES = ['director', 'authorized_signatory', 'company_secretary', 'compliance_officer', 'other'];

    protected $fillable = [
        'legal_entity_profile_id',
        'name',
        'designation',
        'email',
        'phone',
        'pan',
        'din',
        'type',
        'is_primary',
        'is_active',
        'appointment_date',
        'cessation_date',
    ];

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'is_active' => 'boolean',
            'appointment_date' => 'date',
            'cessation_date' => 'date',
        ];
    }

    public function legalEntityProfile()
    {
        return $this->belongsTo(LegalEntityProfile::class, 'legal_entity_profile_id');
    }
}
