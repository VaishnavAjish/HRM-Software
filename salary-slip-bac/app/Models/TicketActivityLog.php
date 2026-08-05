<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Append-only. Business rule 3 ("ticket history can never be deleted") is the
 * whole point of the table, so it carries created_at and nothing updates it.
 */
class TicketActivityLog extends Model
{
    public const UPDATED_AT = null;

    protected $fillable = [
        'ticket_id', 'action', 'performed_by', 'old_status', 'new_status', 'remarks',
    ];

    protected function casts(): array
    {
        return [
            'created_at' => 'datetime',
        ];
    }

    public function ticket()
    {
        return $this->belongsTo(Ticket::class);
    }

    public function performer()
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
