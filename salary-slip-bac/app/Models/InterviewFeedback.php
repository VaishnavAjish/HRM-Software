<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InterviewFeedback extends Model
{
    protected $table = 'interview_feedback';

    protected $fillable = [
        'interview_id', 'panelist_id', 'rating', 'recommendation',
        'strengths', 'concerns', 'notes', 'submitted_at',
    ];

    protected function casts(): array
    {
        return [
            'submitted_at' => 'datetime',
        ];
    }

    public function interview()
    {
        return $this->belongsTo(Interview::class, 'interview_id');
    }

    public function panelist()
    {
        return $this->belongsTo(User::class, 'panelist_id');
    }
}
