<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * organization_change_approvals — ordered approval steps for change requests (02.09).
 *
 * Every request requires Organization Owner approval; restructure, merge, split,
 * closure, manager reassignment, and mass movement also require HR approval.
 */
class OrganizationChangeApproval extends Model
{
    public const APPROVER_ROLES = ['organization_owner', 'hr_approver'];

    public const STATUSES = ['pending', 'approved', 'rejected'];

    protected $fillable = [
        'change_request_id',
        'sequence',
        'approver_role',
        'approver_user_id',
        'status',
        'acted_at',
        'comments',
    ];

    protected function casts(): array
    {
        return [
            'sequence' => 'integer',
            'acted_at' => 'date',
        ];
    }

    public function changeRequest()
    {
        return $this->belongsTo(OrganizationChangeRequest::class, 'change_request_id');
    }

    public function approver()
    {
        return $this->belongsTo(User::class, 'approver_user_id');
    }
}
