<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * position_history — immutable audit trail for position lifecycle (03.03).
 *
 * Records: Creation, Approval, Assignment, Transfer, Freeze, Unfreeze, Reclassification, Closure, Reopening.
 * Never overwrites history.
 */
class PositionHistory extends Model
{
    public const EVENT_TYPES = [
        'created', 'requested', 'approved', 'rejected', 'opened',
        'assigned', 'transferred', 'frozen', 'unfrozen',
        'reclassified', 'closed', 'reopened', 'cancelled', 'expired'
    ];

    protected $fillable = [
        'position_id',
        'event_type',
        'old_values',
        'new_values',
        'changed_by',
        'reason',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'old_values' => 'array',
            'new_values' => 'array',
            'metadata' => 'array',
        ];
    }

    public function position()
    {
        return $this->belongsTo(OrganizationPosition::class, 'position_id');
    }

    public function changer()
    {
        return $this->belongsTo(User::class, 'changed_by');
    }
}
