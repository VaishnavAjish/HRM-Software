<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_change_requests — change requests for organization restructure (02.09).
 *
 * Workflow: DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED → SCHEDULED → APPLIED.
 * Terminal: REJECTED, CANCELLED, FAILED.
 */
class OrganizationChangeRequest extends Model
{
    public const CHANGE_TYPES = [
        'restructure', 'department_create', 'department_merge', 'department_split',
        'department_closure', 'branch_closure', 'location_closure', 'cost_center_change',
        'manager_reassignment', 'mass_movement', 'effective_dated_change',
        'promotion_transfer',
    ];

    public const STATUSES = [
        'draft', 'submitted', 'pending_approval', 'approved', 'scheduled',
        'applied', 'rejected', 'cancelled', 'failed',
    ];

    protected $fillable = [
        'enterprise_id',
        'company_id',
        'code',
        'name',
        'description',
        'change_type',
        'status',
        'requested_by',
        'organization_owner_approver_id',
        'hr_approver_id',
        'requested_at',
        'submitted_at',
        'approved_at',
        'scheduled_at',
        'applied_at',
        'rejected_at',
        'cancelled_at',
        'rejection_reason',
        'before_snapshot',
        'after_snapshot',
    ];

    protected function casts(): array
    {
        return [
            'requested_at' => 'date',
            'submitted_at' => 'date',
            'approved_at' => 'date',
            'scheduled_at' => 'date',
            'applied_at' => 'date',
            'rejected_at' => 'date',
            'cancelled_at' => 'date',
            'before_snapshot' => 'array',
            'after_snapshot' => 'array',
        ];
    }

    public function enterprise()
    {
        return $this->belongsTo(Enterprise::class);
    }

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function requester()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function requestedBy()
    {
        return $this->belongsTo(User::class, 'requested_by');
    }

    public function organizationOwnerApprover()
    {
        return $this->belongsTo(User::class, 'organization_owner_approver_id');
    }

    public function hrApprover()
    {
        return $this->belongsTo(User::class, 'hr_approver_id');
    }

    public function items()
    {
        return $this->hasMany(OrganizationChangeItem::class, 'change_request_id');
    }

    public function approvals()
    {
        return $this->hasMany(OrganizationChangeApproval::class, 'change_request_id')->orderBy('sequence');
    }
}
