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

    public const RELATIONSHIP_TYPES = [
        'self',
        'spouse', 'wife', 'husband',
        'child', 'son', 'daughter',
        'parent', 'father', 'mother',
        'grandparents', 'grandparent', 'grandfather', 'grandmother',
        'brother', 'sister', 'sibling',
        'parent_in_law', 'father_in_law', 'mother_in_law',
        'others', 'other',
    ];

    public static function categoryForRelationship(?string $type): string
    {
        $normalized = strtolower(trim((string) $type));

        return match ($normalized) {
            'spouse', 'wife', 'husband' => 'spouse',
            'child', 'son', 'daughter' => 'child',
            'parent', 'father', 'mother' => 'parent',
            'grandparents', 'grandparent', 'grandfather', 'grandmother' => 'grandparent',
            'brother', 'sister', 'sibling' => 'sibling',
            'parent_in_law', 'father_in_law', 'mother_in_law' => 'parent_in_law',
            'self' => 'self',
            default => 'other',
        };
    }

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
