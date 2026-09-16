<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_hospitals — hospital directory (network + non-network).
 * Inactive hospitals are retained (status flip, never deleted) so
 * historical claims still resolve the hospital they were treated at.
 */
class MediclaimHospital extends Model
{
    public const STATUSES = ['active', 'inactive'];

    protected $fillable = [
        'company_code',
        'name',
        'address',
        'city',
        'state',
        'pincode',
        'latitude',
        'longitude',
        'google_maps_url',
        'specialties',
        'is_cashless',
        'active_from',
        'active_to',
        'status',
        'created_by',
        'updated_by',
    ];

    protected function casts(): array
    {
        return [
            'specialties' => 'array',
            'is_cashless' => 'boolean',
            'latitude' => 'decimal:7',
            'longitude' => 'decimal:7',
            'active_from' => 'date',
            'active_to' => 'date',
        ];
    }

    public function contacts()
    {
        return $this->hasMany(MediclaimHospitalContact::class, 'hospital_id');
    }

    public function policyVersions()
    {
        return $this->belongsToMany(MediclaimPolicyVersion::class, 'mediclaim_policy_hospitals', 'hospital_id', 'policy_version_id')
            ->withTimestamps();
    }

    public function claims()
    {
        return $this->hasMany(MediclaimClaim::class, 'hospital_id');
    }

    public function intimations()
    {
        return $this->hasMany(MediclaimIntimation::class, 'hospital_id');
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
