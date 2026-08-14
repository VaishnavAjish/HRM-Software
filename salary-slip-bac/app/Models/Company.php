<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A company — the tenant every scope check ultimately resolves to.
 *
 * `code` is not a label. It is the value stored in users.company_code, which
 * ScopeMatcher, AuthorizedUserQuery and the authorization cache partition on, so
 * changing it silently rescopes every account that carries it. CompanyUnitService
 * locks it once the company is in use for exactly that reason.
 *
 * The enterprise attributes (legal_name, registration_number, ...) are the
 * DOMAIN 02.01 Enterprise Master surface. They are configuration beside the
 * tenant key: nullable, and never read by any scope decision.
 */
class Company extends Model
{
    protected $fillable = [
        'name',
        'code',
        'is_active',
        'legal_name',
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
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'incorporation_date' => 'date',
        ];
    }

    public function units()
    {
        return $this->hasMany(Unit::class);
    }

    public function legalEntities()
    {
        return $this->hasMany(LegalEntity::class);
    }

    public function locations()
    {
        return $this->hasMany(Location::class);
    }

    public function calendars()
    {
        return $this->hasMany(Calendar::class);
    }
}
