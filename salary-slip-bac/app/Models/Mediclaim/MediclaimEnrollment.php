<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_enrollments — one row per employee's enrollment in a policy
 * version. No columns are added to `users`; the employee is always an
 * `employee_user_id` FK.
 */
class MediclaimEnrollment extends Model
{
    public const STATUSES = ['active', 'inactive', 'suspended', 'terminated'];

    protected $fillable = [
        'policy_version_id',
        'employee_user_id',
        'company_code',
        'status',
        'enrolled_at',
        'terminated_at',
    ];

    protected function casts(): array
    {
        return [
            'enrolled_at' => 'date',
            'terminated_at' => 'date',
        ];
    }

    public function policyVersion()
    {
        return $this->belongsTo(MediclaimPolicyVersion::class, 'policy_version_id');
    }

    public function employee()
    {
        return $this->belongsTo(User::class, 'employee_user_id');
    }

    public function members()
    {
        return $this->hasMany(MediclaimMember::class, 'enrollment_id');
    }

    public function changeRequests()
    {
        return $this->hasMany(MediclaimMemberChangeRequest::class, 'enrollment_id');
    }

    public function claims()
    {
        return $this->hasMany(MediclaimClaim::class, 'enrollment_id');
    }

    public function floaterOverrides()
    {
        return $this->hasMany(MediclaimFloaterOverride::class, 'enrollment_id');
    }
}
