<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A legal entity — the statutory employing entity under a company (02.02).
 *
 * One company may operate several legal entities (one per country, or a
 * holding and its subsidiaries). Future payroll tables carry a
 * `legal_entity_id` to say which statutory entity employs a person; the
 * `is_primary` flag is the default when nothing names one. A code is unique
 * within a company, matching the unit rule — a name like "Silver Star" alone
 * never identifies an entity because the company does.
 */
class LegalEntity extends Model
{
    protected $fillable = [
        'company_id',
        'code',
        'name',
        'legal_name',
        'registration_number',
        'country_code',
        'tax_id',
        'currency',
        'fiscal_year_start',
        'primary_address',
        'contact_email',
        'contact_phone',
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

    public function company()
    {
        return $this->belongsTo(Company::class);
    }
}
