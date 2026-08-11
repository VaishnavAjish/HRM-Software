<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Append-only: who held the ticket, when, and why it moved. */
class TicketAssignmentHistory extends Model
{
    protected $table = 'ticket_assignment_history';

    public const UPDATED_AT = null;

    public const METHOD_MANUAL = 'manual';

    public const METHOD_ROUTING = 'hierarchy_routing';

    public const METHOD_ESCALATION = 'escalation';

    public const METHOD_BULK = 'bulk';

    public const METHOD_OVERRIDE = 'override';

    protected $fillable = [
        'ticket_id', 'from_user_id', 'to_user_id', 'method', 'performed_by', 'reason',
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
