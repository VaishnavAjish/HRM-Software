<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_settlements — one-or-more settlement rows per claim
 * (`sequence_no` per claim), since real insurance settlements are often
 * phased rather than a single payout.
 */
class MediclaimSettlement extends Model
{
    protected $fillable = [
        'claim_id',
        'sequence_no',
        'settled_amount',
        'settlement_date',
        'settlement_mode',
        'reference_number',
        'remarks',
        'recorded_by',
    ];

    protected function casts(): array
    {
        return [
            'settled_amount' => 'decimal:2',
            'settlement_date' => 'date',
        ];
    }

    public function claim()
    {
        return $this->belongsTo(MediclaimClaim::class, 'claim_id');
    }

    public function recordedBy()
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
