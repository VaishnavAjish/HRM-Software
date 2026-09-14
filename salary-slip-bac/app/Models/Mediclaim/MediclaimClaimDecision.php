<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_claim_decisions — one append-only row per stage decision
 * (manager, H/I/J/K), holding the free-form per-stage fields (e.g.
 * director's approved amount, HR's eligibility checkboxes) in `fields`
 * JSON so each stage's distinct shape doesn't need its own table.
 */
class MediclaimClaimDecision extends Model
{
    public const STAGES = [
        'MANAGER_REVIEW',
        'COORDINATOR_VERIFICATION',
        'COMMITTEE_RECOMMENDATION',
        'HR_ELIGIBILITY_VERIFICATION',
        'DIRECTOR_FINAL_APPROVAL',
    ];

    public const DECISIONS = [
        'approved', 'rejected', 'returned', 'verified',
        'recommended', 'not_recommended', 'partially_approved',
    ];

    protected $fillable = [
        'claim_id',
        'stage',
        'decided_by',
        'decision',
        'remarks',
        'fields',
        'decided_at',
    ];

    protected function casts(): array
    {
        return [
            'fields' => 'array',
            'decided_at' => 'datetime',
        ];
    }

    public function claim()
    {
        return $this->belongsTo(MediclaimClaim::class, 'claim_id');
    }

    public function decidedBy()
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}
