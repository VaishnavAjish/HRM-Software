<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_positions — positions within organization units (02.03 + 03.03).
 *
 * Each position carries an approved headcount; employees are assigned through
 * employee_organization_assignments. `reports_to_position_id` builds the
 * position-level chain (02.08 org chart).
 *
 * Extended for Domain 03: links to Job, Grade, Employment Type, Position Type,
 * Approval workflow, Capacity breakdown (Headcount + FTE).
 */
class OrganizationPosition extends Model
{
    public const STATUSES = [
        'draft', 'requested', 'pending_approval', 'approved',
        'open', 'filled', 'partially_filled', 'frozen', 'closed', 'cancelled', 'expired'
    ];

    public const POSITION_TYPES = [
        'permanent', 'temporary', 'shared', 'seasonal'
    ];

    protected $fillable = [
        'organization_unit_id',
        'job_id',
        'grade_id',
        'code',
        'title',
        'description',
        'approved_headcount',
        'budgeted_headcount',
        'current_headcount',
        'fte_capacity',
        'filled_headcount',
        'vacant_headcount',
        'reserved_headcount',
        'status',
        'position_type',
        'employment_type',
        'reports_to_position_id',
        'approval_status',
        'approved_at',
        'approved_by',
        'budget_id',
        'frozen_at',
        'frozen_by',
        'freeze_reason',
        'effective_from',
        'effective_to',
    ];

    protected function casts(): array
    {
        return [
            'approved_headcount' => 'integer',
            'budgeted_headcount' => 'integer',
            'current_headcount' => 'integer',
            'fte_capacity' => 'decimal:2',
            'filled_headcount' => 'integer',
            'vacant_headcount' => 'integer',
            'reserved_headcount' => 'integer',
            'approval_status' => 'string',
            'approved_at' => 'datetime',
            'frozen_at' => 'datetime',
            'effective_from' => 'date',
            'effective_to' => 'date',
        ];
    }

    public function organizationUnit()
    {
        return $this->belongsTo(OrganizationUnit::class, 'organization_unit_id');
    }

    public function job()
    {
        return $this->belongsTo(Job::class, 'job_id');
    }

    public function grade()
    {
        return $this->belongsTo(JobGrade::class, 'grade_id');
    }

    public function reportsTo()
    {
        return $this->belongsTo(self::class, 'reports_to_position_id');
    }

    public function assignments()
    {
        return $this->hasMany(EmployeeOrganizationAssignment::class, 'position_id');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approved_by');
    }

    public function frozenBy()
    {
        return $this->belongsTo(User::class, 'frozen_by');
    }

    public function history()
    {
        return $this->hasMany(PositionHistory::class);
    }
}
