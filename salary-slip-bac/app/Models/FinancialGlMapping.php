<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * financial_gl_mappings — General Ledger mappings for financial organizations (02.05).
 */
class FinancialGlMapping extends Model
{
    public const MAPPING_TYPES = ['debit', 'credit', 'both'];

    protected $fillable = [
        'financial_organization_id',
        'gl_account_code',
        'gl_account_name',
        'mapping_type',
        'is_active',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function financialOrganization()
    {
        return $this->belongsTo(FinancialOrganization::class);
    }
}
