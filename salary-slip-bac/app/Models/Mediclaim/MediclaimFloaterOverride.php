<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_floater_overrides — audited override of the family floater cap
 * (e.g. the standard 3,00,000 limit). ClaimWorkflowService::directorFinalApproval()
 * enforces assertWithinFloater() unless an authorized row here accompanies
 * the decision.
 */
class MediclaimFloaterOverride extends Model
{
    protected $fillable = [
        'enrollment_id',
        'claim_id',
        'override_amount',
        'reason',
        'approved_by',
        'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'override_amount' => 'decimal:2',
            'approved_at' => 'datetime',
        ];
    }

    public function enrollment()
    {
        return $this->belongsTo(MediclaimEnrollment::class, 'enrollment_id');
    }

    public function claim()
    {
        return $this->belongsTo(MediclaimClaim::class, 'claim_id');
    }

    public function approvedBy()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }
}
