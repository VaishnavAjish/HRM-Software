<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_claim_assignments — per-stage reviewer assignment, including
 * the confidentiality acknowledgement a manager must record (timestamp +
 * IP/UA) before ClaimWorkflowService::managerDecision() will accept a
 * decision from them. reassignReviewer() supersedes the old row via
 * `superseded_by_assignment_id` rather than mutating it in place.
 */
class MediclaimClaimAssignment extends Model
{
    public const STAGE_MANAGER_REVIEW = 'MANAGER_REVIEW';

    public const STAGE_COORDINATOR_VERIFICATION = 'COORDINATOR_VERIFICATION';

    public const STAGE_COMMITTEE_RECOMMENDATION = 'COMMITTEE_RECOMMENDATION';

    public const STAGE_HR_ELIGIBILITY_VERIFICATION = 'HR_ELIGIBILITY_VERIFICATION';

    public const STAGE_DIRECTOR_FINAL_APPROVAL = 'DIRECTOR_FINAL_APPROVAL';

    public const STAGES = [
        self::STAGE_MANAGER_REVIEW,
        self::STAGE_COORDINATOR_VERIFICATION,
        self::STAGE_COMMITTEE_RECOMMENDATION,
        self::STAGE_HR_ELIGIBILITY_VERIFICATION,
        self::STAGE_DIRECTOR_FINAL_APPROVAL,
    ];

    public const STATUSES = ['ACTIVE', 'SUPERSEDED', 'COMPLETED'];

    protected $fillable = [
        'claim_id',
        'stage',
        'assigned_to',
        'status',
        'confidentiality_ack_at',
        'confidentiality_ack_ip',
        'confidentiality_ack_user_agent',
        'assigned_by',
        'reassigned_reason',
        'superseded_by_assignment_id',
    ];

    protected function casts(): array
    {
        return [
            'confidentiality_ack_at' => 'datetime',
        ];
    }

    public function claim()
    {
        return $this->belongsTo(MediclaimClaim::class, 'claim_id');
    }

    public function assignee()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function assignedBy()
    {
        return $this->belongsTo(User::class, 'assigned_by');
    }

    public function supersededByAssignment()
    {
        return $this->belongsTo(MediclaimClaimAssignment::class, 'superseded_by_assignment_id');
    }
}
