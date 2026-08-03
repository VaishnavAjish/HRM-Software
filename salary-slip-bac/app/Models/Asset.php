<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Asset extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'asset_tag', 'category', 'brand', 'model', 'serial_number',
        'purchase_date', 'purchase_cost', 'warranty_expiry', 'amc_expiry',
        'status', 'condition', 'qr_code_value', 'notes', 'company_code', 'unit',
    ];

    protected function casts(): array
    {
        return [
            'purchase_date' => 'date',
            'warranty_expiry' => 'date',
            'amc_expiry' => 'date',
        ];
    }

    public function allocations()
    {
        return $this->hasMany(AssetAllocation::class, 'asset_id');
    }

    public function activeAllocation()
    {
        return $this->hasOne(AssetAllocation::class, 'asset_id')->where('status', 'active');
    }
}
