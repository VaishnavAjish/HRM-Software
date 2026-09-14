<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_member_change_requests — employee-submitted add/update/remove
 * requests against their covered members, HR-decided. `member_id` is null
 * for an add-new-member request; `previous_values` preserves what the
 * member row looked like before an approved change.
 */
class MediclaimMemberChangeRequest extends Model
{
    public const REQUEST_TYPES = ['add', 'update', 'remove'];

    public const STATUSES = ['pending', 'approved', 'rejected', 'cancelled'];

    protected $fillable = [
        'employee_user_id',
        'enrollment_id',
        'member_id',
        'request_type',
        'proposed_values',
        'previous_values',
        'status',
        'decided_by',
        'decided_at',
        'decision_remarks',
        'effective_from',
    ];

    protected function casts(): array
    {
        return [
            'proposed_values' => 'array',
            'previous_values' => 'array',
            'decided_at' => 'datetime',
            'effective_from' => 'date',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(User::class, 'employee_user_id');
    }

    public function enrollment()
    {
        return $this->belongsTo(MediclaimEnrollment::class, 'enrollment_id');
    }

    public function member()
    {
        return $this->belongsTo(MediclaimMember::class, 'member_id');
    }

    public function decidedBy()
    {
        return $this->belongsTo(User::class, 'decided_by');
    }
}
