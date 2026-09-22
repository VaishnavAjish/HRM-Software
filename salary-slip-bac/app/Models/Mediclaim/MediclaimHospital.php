<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_hospitals — a single shared hospital directory, not scoped per
 * company (2026-09-22, at the user's explicit direction) — `company_code`
 * stays `NOT NULL` on the row for the audit trail only, and is always
 * `all-companies`; see `HospitalController`'s docblock.
 *
 * `status` (`active`/`inactive`) is a separate, still-supported "hide from
 * the employee directory without deleting" flag — e.g. a temporarily closed
 * hospital. Deleting the row itself (`HospitalController::destroy()`) is a
 * genuine, permanent delete as of 2026-09-22 (previously just flipped
 * `status` to `inactive`); `hospital_id` on claims/intimations is
 * `nullOnDelete()`, so a deleted hospital simply detaches from any
 * historical claim rather than blocking the delete.
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

    protected $appends = ['is_network_hospital', 'cashless_available'];

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

    /**
     * Normalizes every write to the documented `STATUSES` convention
     * (`active`/`inactive`, lowercase) regardless of what a caller sends —
     * the admin hospital form was found submitting `"ACTIVE"`/`"INACTIVE"`
     * (uppercase), which every case-sensitive `where('status', 'active')`
     * filter elsewhere in the app would silently miss.
     */
    public function setStatusAttribute($value): void
    {
        $normalized = strtolower(trim((string) $value));
        $this->attributes['status'] = in_array($normalized, self::STATUSES, true) ? $normalized : 'active';
    }

    public function getIsNetworkHospitalAttribute(): bool
    {
        return true;
    }

    public function getCashlessAvailableAttribute(): bool
    {
        return (bool) $this->is_cashless;
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
