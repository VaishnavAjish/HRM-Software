<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CandidateCommunication extends Model
{
    public const TYPE_EMAIL = 'email';
    public const TYPE_SMS = 'sms';
    public const TYPE_PHONE = 'phone';
    public const TYPE_OTHER = 'other';

    public const STATUS_QUEUED = 'queued';
    public const STATUS_SENT = 'sent';
    public const STATUS_FAILED = 'failed';

    protected $fillable = [
        'candidate_id', 'type', 'direction', 'subject', 'body',
        'status', 'sent_by', 'sent_at', 'error_message',
    ];

    protected function casts(): array
    {
        return [
            'sent_at' => 'datetime',
        ];
    }

    public function candidate()
    {
        return $this->belongsTo(Candidate::class, 'candidate_id');
    }

    public function sentBy()
    {
        return $this->belongsTo(User::class, 'sent_by');
    }
}