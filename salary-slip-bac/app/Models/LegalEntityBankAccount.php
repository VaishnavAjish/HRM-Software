<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Crypt;

/**
 * legal_entity_bank_accounts — banking details for a legal entity profile (02.02).
 *
 * The full account number is encrypted at rest (AES-256-CBC); only the masked
 * value and last four digits are ever returned by the API.
 */
class LegalEntityBankAccount extends Model
{
    protected $fillable = [
        'legal_entity_profile_id',
        'bank_name',
        'branch_name',
        'ifsc_code',
        'account_type',
        'encrypted_account_number',
        'account_number_last_four',
        'account_number_masked',
        'is_primary',
        'is_active',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'is_primary' => 'boolean',
            'is_active' => 'boolean',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function legalEntityProfile()
    {
        return $this->belongsTo(LegalEntityProfile::class, 'legal_entity_profile_id');
    }

    /**
     * Store an account number encrypted at rest with its display fragments.
     *
     * The plain number is never kept on the model; only the AES-256-CBC cipher
     * text and the masked / last-four fragments are persisted.
     */
    public function setAccountNumber(string $accountNumber): void
    {
        $this->attributes['encrypted_account_number'] = Crypt::encryptString($accountNumber);

        $digits = preg_replace('/\D/', '', $accountNumber);
        $lastFour = strlen($digits) >= 4 ? substr($digits, -4) : $digits;
        $this->account_number_last_four = $lastFour;
        $this->account_number_masked = strlen($digits) >= 4 ? 'XXXX XXXX XXXX '.$lastFour : str_repeat('X', max(0, strlen($accountNumber)));
    }
}
