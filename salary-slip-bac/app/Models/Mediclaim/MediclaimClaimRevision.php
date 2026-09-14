<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_claim_revisions — one row per resubmission after
 * RETURNED_FOR_CORRECTION, holding a full JSON snapshot of the claim's
 * prior state. Append-only: rows are never updated or deleted.
 */
class MediclaimClaimRevision extends Model
{
    protected $fillable = [
        'claim_id',
        'revision_number',
        'prior_state',
        'reason',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'prior_state' => 'array',
        ];
    }

    public function claim()
    {
        return $this->belongsTo(MediclaimClaim::class, 'claim_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
