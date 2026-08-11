<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Append-only record of each step up the authority chain. */
class TicketEscalationHistory extends Model
{
    protected $table = 'ticket_escalation_history';

    public const UPDATED_AT = null;

    public const TRIGGER_INACTIVITY = 'sla_inactivity';

    public const TRIGGER_MANUAL = 'manual';

    public const TRIGGER_OVERRIDE = 'override';

    protected $fillable = [
        'ticket_id', 'from_level', 'to_level', 'from_user_id', 'to_user_id',
        'trigger', 'performed_by', 'reason',
    ];

    protected function casts(): array
    {
        return ['created_at' => 'datetime'];
    }

    public function ticket()
    {
        return $this->belongsTo(Ticket::class);
    }

    public function fromUser()
    {
        return $this->belongsTo(User::class, 'from_user_id');
    }

    public function toUser()
    {
        return $this->belongsTo(User::class, 'to_user_id');
    }

    public function performer()
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
