<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PerformanceGoal extends Model
{
    protected $fillable = [
        'cycle_id', 'user_id', 'type', 'title', 'description', 'weight',
        'target_value', 'achieved_value', 'status', 'created_by',
    ];

    public function cycle()
    {
        return $this->belongsTo(PerformanceCycle::class, 'cycle_id');
    }

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }
}
