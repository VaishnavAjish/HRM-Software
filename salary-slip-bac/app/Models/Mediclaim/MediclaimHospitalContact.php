<?php

namespace App\Models\Mediclaim;

use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_hospital_contacts — per-hospital contact points (a named
 * "concern person" with an optional designation/photo), each with an
 * escalation priority so the card verify page and admin directory can
 * surface the right one first.
 */
class MediclaimHospitalContact extends Model
{
    protected $fillable = [
        'hospital_id',
        'name',
        'designation',
        'phone',
        'email',
        'photo',
        'availability',
        'escalation_priority',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
        ];
    }

    public function hospital()
    {
        return $this->belongsTo(MediclaimHospital::class, 'hospital_id');
    }
}
