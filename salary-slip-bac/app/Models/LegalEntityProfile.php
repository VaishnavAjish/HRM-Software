<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * legal_entity_profiles — extended statutory details for a company (02.02).
 *
 * One-to-one with a company (the tenant). This holds the corporate
 * identification number, incorporation date and correspondence details that
 * don't belong on the company record itself. The separate `legal_entities`
 * table is the employing entity payroll names.
 */
class LegalEntityProfile extends Model
{
    protected $fillable = [
        'company_id',
        'legal_name',
        'trading_name',
        'corporate_identification_number',
        'incorporation_date',
        'country_code',
        'registered_address',
        'correspondence_address',
        'contact_email',
        'contact_phone',
        'website',
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

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function registrations()
    {
        return $this->hasMany(LegalEntityRegistration::class);
    }

    public function addresses()
    {
        return $this->hasMany(LegalEntityAddress::class);
    }

    public function representatives()
    {
        return $this->hasMany(LegalEntityRepresentative::class);
    }

    public function bankAccounts()
    {
        return $this->hasMany(LegalEntityBankAccount::class);
    }
}
