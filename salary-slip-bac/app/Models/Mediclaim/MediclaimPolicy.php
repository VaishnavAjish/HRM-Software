<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_policies — top-level Mediclaim policy per company. The rules
 * that actually govern eligibility live on the versioned
 * MediclaimPolicyVersion::rules JSON, never here.
 */
class MediclaimPolicy extends Model
{
    public const STATUSES = ['draft', 'active', 'inactive', 'archived'];

    protected $fillable = [
        'company_code',
        'policy_code',
        'name',
        'insurer_name',
        'status',
        'description',
        'created_by',
        'updated_by',
    ];

    public function versions()
    {
        return $this->hasMany(MediclaimPolicyVersion::class, 'policy_id');
    }

    public function reviewerAssignments()
    {
        return $this->hasMany(MediclaimReviewerAssignment::class, 'policy_id');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function updatedBy()
    {
        return $this->belongsTo(User::class, 'updated_by');
    }
}
