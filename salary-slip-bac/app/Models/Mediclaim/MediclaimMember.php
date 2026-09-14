<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_members — covered members (self/spouse/child/parent),
 * effective-dated. Removed members are retained (status flip) so past
 * claims and cards still resolve who they covered.
 */
class MediclaimMember extends Model
{
    public const STATUSES = ['active', 'inactive', 'removed'];

    public const RELATIONSHIP_TYPES = ['self', 'spouse', 'child', 'parent'];

    protected $fillable = [
        'enrollment_id',
        'employee_user_id',
        'full_name',
        'relationship_type',
        'date_of_birth',
        'gender',
        'status',
        'effective_from',
        'effective_to',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function enrollment()
    {
        return $this->belongsTo(MediclaimEnrollment::class, 'enrollment_id');
    }

    public function employee()
    {
        return $this->belongsTo(User::class, 'employee_user_id');
    }

    public function cards()
    {
        return $this->hasMany(MediclaimCard::class, 'member_id');
    }

    public function claims()
    {
        return $this->hasMany(MediclaimClaim::class, 'member_id');
    }

    public function intimations()
    {
        return $this->hasMany(MediclaimIntimation::class, 'member_id');
    }

    public function changeRequests()
    {
        return $this->hasMany(MediclaimMemberChangeRequest::class, 'member_id');
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
