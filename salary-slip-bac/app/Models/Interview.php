<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Interview extends Model
{
    protected $fillable = [
        'candidate_id', 'requisition_id', 'round_name', 'scheduled_at',
        'duration_minutes', 'mode', 'meeting_link', 'status', 'notes', 'created_by',
        'google_event_id', 'meeting_status', 'meeting_error', 'meeting_created_at',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'meeting_created_at' => 'datetime',
        ];
    }

    public function candidate()
    {
        return $this->belongsTo(Candidate::class, 'candidate_id');
    }

    public function requisition()
    {
        return $this->belongsTo(JobRequisition::class, 'requisition_id');
    }

    public function panelists()
    {
        return $this->hasMany(InterviewPanelist::class, 'interview_id');
    }

    public function feedback()
    {
        return $this->hasMany(InterviewFeedback::class, 'interview_id');
    }
}
