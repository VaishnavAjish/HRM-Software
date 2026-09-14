<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_intimations — office-notify records for planned/emergency
 * treatment, each with an atomically-allocated `reference_number`
 * (MediclaimIntimationNumber). `linked_claim_id` is set once the employee
 * later files a claim for the same treatment.
 */
class MediclaimIntimation extends Model
{
    public const STATUSES = ['recorded', 'linked', 'closed'];

    protected $fillable = [
        'employee_user_id',
        'member_id',
        'hospital_id',
        'company_code',
        'reference_number',
        'treating_doctor',
        'planned_treatment',
        'estimated_amount',
        'employee_remarks',
        'is_emergency',
        'emergency_explanation',
        'notified_at',
        'notified_by',
        'expected_admission_date',
        'status',
        'linked_claim_id',
    ];

    protected function casts(): array
    {
        return [
            'estimated_amount' => 'decimal:2',
            'is_emergency' => 'boolean',
            'notified_at' => 'datetime',
            'expected_admission_date' => 'date',
        ];
    }

    public function notifiedBy()
    {
        return $this->belongsTo(User::class, 'notified_by');
    }

    public function employee()
    {
        return $this->belongsTo(User::class, 'employee_user_id');
    }

    public function member()
    {
        return $this->belongsTo(MediclaimMember::class, 'member_id');
    }

    public function hospital()
    {
        return $this->belongsTo(MediclaimHospital::class, 'hospital_id');
    }

    public function linkedClaim()
    {
        return $this->belongsTo(MediclaimClaim::class, 'linked_claim_id');
    }
}
