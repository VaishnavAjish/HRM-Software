<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AssetAllocation extends Model
{
    protected $fillable = [
        'asset_id', 'user_id', 'allocated_by', 'allocated_at', 'expected_return_at',
        'returned_at', 'return_condition', 'status', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'allocated_at' => 'datetime',
            'expected_return_at' => 'date',
            'returned_at' => 'datetime',
        ];
    }

    public function asset()
    {
        return $this->belongsTo(Asset::class, 'asset_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function allocatedBy()
    {
        return $this->belongsTo(User::class, 'allocated_by');
    }
}
