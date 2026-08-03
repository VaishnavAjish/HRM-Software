<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PerformanceReview extends Model
{
    protected $fillable = [
        'cycle_id', 'user_id', 'reviewer_id', 'review_type', 'overall_rating',
        'potential_rating', 'competency_ratings', 'strengths', 'improvements',
        'status', 'submitted_at', 'acknowledged_at',
    ];

    protected function casts(): array
    {
        return [
            'competency_ratings' => 'array',
            'submitted_at' => 'datetime',
            'acknowledged_at' => 'datetime',
        ];
    }

    public function cycle()
    {
        return $this->belongsTo(PerformanceCycle::class, 'cycle_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewer_id');
    }
}
