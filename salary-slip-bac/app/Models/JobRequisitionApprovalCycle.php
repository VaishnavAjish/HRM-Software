<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobRequisitionApprovalCycle extends Model
{
    public const STATUS_PENDING = 'PENDING';
    public const STATUS_APPROVED = 'APPROVED';
    public const STATUS_REJECTED = 'REJECTED';
    public const STATUS_WITHDRAWN = 'WITHDRAWN';

    protected $fillable = [
        'job_requisition_id', 'cycle_number', 'status', 'snapshot',
        'submitted_by', 'submitted_at', 'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'snapshot' => 'array',
            'submitted_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function requisition()
    {
        return $this->belongsTo(JobRequisition::class, 'job_requisition_id');
    }

    public function submitter()
    {
        return $this->belongsTo(User::class, 'submitted_by');
    }

    public function steps()
    {
        return $this->hasMany(JobRequisitionApprovalStep::class, 'approval_cycle_id')->orderBy('step_order');
    }
}
