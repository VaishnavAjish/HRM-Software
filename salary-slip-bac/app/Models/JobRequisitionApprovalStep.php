<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class JobRequisitionApprovalStep extends Model
{
    public const TYPE_HR_MANAGER = 'HR_MANAGER';
    public const TYPE_HIRING_MANAGER = 'HR_MANAGER'; // Alias for backward compatibility
    public const TYPE_DIRECTOR = 'DIRECTOR';

    public const STATUS_WAITING = 'WAITING';
    public const STATUS_PENDING = 'PENDING';
    public const STATUS_APPROVED = 'APPROVED';
    public const STATUS_RETURNED = 'RETURNED';
    public const STATUS_REJECTED = 'REJECTED';
    public const STATUS_SKIPPED = 'SKIPPED';
    public const STATUS_WITHDRAWN = 'WITHDRAWN';

    protected $fillable = [
        'approval_cycle_id', 'step_order', 'step_type', 'assigned_to',
        'status', 'comment', 'decided_by', 'decided_at',
    ];

    protected function casts(): array
    {
        return ['decided_at' => 'datetime'];
    }

    public function cycle()
    {
        return $this->belongsTo(JobRequisitionApprovalCycle::class, 'approval_cycle_id');
    }

    public function assignedUser()
    {
        return $this->belongsTo(User::class, 'assigned_to');
    }

    public function decisionActor()
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}
