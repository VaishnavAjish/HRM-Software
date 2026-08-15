<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Currency — Domain 00.3 Global Master Data.
 *
 * Supported currencies for the application. Used for payroll, financial,
 * and transactional purposes. The symbol is for display only; the code is
 * the primary unique identifier.
 *
 * Do not use the symbol as the primary unique identifier (per Domain 00.03).
 */
class Currency extends Model
{
    protected $fillable = [
        'code',
        'name',
        'symbol',
        'decimals',
        'status',
    ];

    protected $casts = [
        'decimals' => 'integer',
    ];

    public $timestamps = false;

    public function staticValues(): array
    {
        return [
            'USD' => ['name' => 'US Dollar', 'symbol' => '$', 'decimals' => 2],
            'EUR' => ['name' => 'Euro', 'symbol' => '€', 'decimals' => 2],
            'GBP' => ['name' => 'British Pound', 'symbol' => '£', 'decimals' => 2],
            'INR' => ['name' => 'Indian Rupee', 'symbol' => '₹', 'decimals' => 2],
            'CAD' => ['name' => 'Canadian Dollar', 'symbol' => 'C$', 'decimals' => 2],
            'AUD' => ['name' => 'Australian Dollar', 'symbol' => 'A$', 'decimals' => 2],
            'JPY' => ['name' => 'Japanese Yen', 'symbol' => '¥', 'decimals' => 0],
            'CHF' => ['name' => 'Swiss Franc', 'symbol' => 'CHF', 'decimals' => 2],
            'CNY' => ['name' => 'Chinese Yuan', 'symbol' => '¥', 'decimals' => 2],
        ];
    }

    public function staticByCode(string $code): ?array
    {
        $values = $this->staticValues();
        return $values[$code] ?? null;
    }

    public function staticBySymbol(string $symbol): ?array
    {
        $values = $this->staticValues();
        $found = null;
        foreach ($values as $code => $info) {
            if ($info['symbol'] === $symbol) {
                $found = ['code' => $code, ...$info];
                break;
            }
        }
        return $found;
    }

    public function companyCurrency(int $companyId): string
    {
        $company = Company::find($companyId);
        return $company?->currency ?? 'USD';
    }
}