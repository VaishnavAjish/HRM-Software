<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_admin_activity_logs — non-claim admin audit trail (hospital,
 * policy, rule-book, reviewer-assignment edits), written by
 * MediclaimActivityLogSupport, same shape as OrganizationActivityLogSupport.
 * Claim-specific history lives in `mediclaim_claim_events` instead.
 */
class MediclaimAdminActivityLog extends Model
{
    protected $fillable = [
        'company_code',
        'subject_type',
        'subject_id',
        'activity_type',
        'actor_id',
        'before_values',
        'after_values',
        'description',
        'ip_address',
        'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'before_values' => 'array',
            'after_values' => 'array',
        ];
    }

    public function subject()
    {
        return $this->morphTo();
    }

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
