<?php

namespace App\Models\Mediclaim;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;

/**
 * mediclaim_claim_events — append-only workflow timeline, written by
 * MediclaimClaimEventLog. `notified_at` is the idempotency anchor for
 * event-anchored notifications: MediclaimNotifier proceeds only after
 * `UPDATE ... SET notified_at = now() WHERE id = ? AND notified_at IS NULL`
 * affects exactly one row.
 */
class MediclaimClaimEvent extends Model
{
    protected $fillable = [
        'claim_id',
        'event_type',
        'from_status',
        'to_status',
        'actor_id',
        'actor_role',
        'before_values',
        'after_values',
        'description',
        'ip_address',
        'user_agent',
        'notified_at',
    ];

    protected function casts(): array
    {
        return [
            'before_values' => 'array',
            'after_values' => 'array',
            'notified_at' => 'datetime',
        ];
    }

    public function claim()
    {
        return $this->belongsTo(MediclaimClaim::class, 'claim_id');
    }

    public function actor()
    {
        return $this->belongsTo(User::class, 'actor_id');
    }
}
