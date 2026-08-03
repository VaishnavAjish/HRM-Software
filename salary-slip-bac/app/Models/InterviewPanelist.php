<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class InterviewPanelist extends Model
{
    protected $fillable = ['interview_id', 'user_id', 'is_lead'];

    protected function casts(): array
    {
        return [
            'is_lead' => 'boolean',
        ];
    }

    public function interview()
    {
        return $this->belongsTo(Interview::class, 'interview_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
