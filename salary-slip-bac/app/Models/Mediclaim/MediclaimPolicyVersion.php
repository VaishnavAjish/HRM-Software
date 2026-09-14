<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_policy_versions — effective-dated, versioned Mediclaim rules
 * (floater limit, max covered children, age limits, exclusions, network
 * requirement) as JSON. PolicyEligibilityService reads every numeric rule
 * from `rules` here, never hardcoded, and resolves the version as-of an
 * explicit date so a later version can never retroactively change an
 * already-decided claim's outcome.
 */
class MediclaimPolicyVersion extends Model
{
    public const STATUSES = ['draft', 'active', 'expired', 'archived'];

    protected $fillable = [
        'policy_id',
        'version_number',
        'status',
        'rules',
        'effective_from',
        'effective_to',
        'published_at',
        'published_by',
        'created_by',
    ];

    protected function casts(): array
    {
        return [
            'rules' => 'array',
            'effective_from' => 'date',
            'effective_to' => 'date',
            'published_at' => 'datetime',
        ];
    }

    public function policy()
    {
        return $this->belongsTo(MediclaimPolicy::class, 'policy_id');
    }

    public function hospitals()
    {
        return $this->belongsToMany(MediclaimHospital::class, 'mediclaim_policy_hospitals', 'policy_version_id', 'hospital_id')
            ->withTimestamps();
    }

    public function enrollments()
    {
        return $this->hasMany(MediclaimEnrollment::class, 'policy_version_id');
    }

    public function claims()
    {
        return $this->hasMany(MediclaimClaim::class, 'policy_version_id');
    }

    public function publishedBy()
    {
        return $this->belongsTo(User::class, 'published_by');
    }

    public function createdBy()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
